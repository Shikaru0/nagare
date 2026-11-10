// ZokoAnime scraper — https://zokoanime.video
//
// ZokoAnime is an embed service keyed by MAL ID + episode + type (sub/dub).
// No Cloudflare, no search: the URL `/stream/mal/{malId}/{ep}/{type}` returns
// an HTML page with `window.__P = "<base64>"`, which decodes (base64 + XOR
// with the fixed key "otaku-embed-v1") to a JSON config containing:
//   - src: HLS master playlist URL (on hls.dramahot.top CDN)
//   - subtitles: separate VTT track files (toggleable in our player)
//   - download_url: MP4 download page (HTML, not a direct file — unused)
//
// The "sub" type is JP audio + EN softsubs (subs are separate VTT files).
//
// Episode enumeration: ZokoAnime has no listing endpoint, so the episode
// count comes from AniList in priority order:
//   1. Media.episodes — set for completed shows (and planned counts).
//   2. Media.nextAiringEpisode.episode - 1 — for ongoing shows, AniList
//      exposes the next episode to air, so current count = next - 1.
//   3. Binary-search probe of zokoanime itself — only when both AniList
//      fields are null (truly unknown schedule). ~22 sequential probes
//      for ~1122-episode shows, cached 1 hour.

import { getAnime } from "../anilist";
import type {
  AnimeRef,
  Episode,
  Provider,
  StreamRequest,
  StreamResult,
  SubtitleTrack,
} from "./types";

const BASE = "https://zokoanime.video";
const OBFUSCATION_KEY = "otaku-embed-v1";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

type ZkPlayerConfig = {
  src?: string;
  subtitles?: {
    src?: string;
    lang?: string;
    label?: string;
    default?: boolean;
  }[];
  download_url?: string;
  video_id?: number;
};

// Decode the base64 + XOR-obfuscated player config from window.__P.
// The XOR key is a fixed string baked into zokoanime's frontend bundle.
function decodePlayerConfig(blob: string): ZkPlayerConfig {
  const bytes = Buffer.from(blob, "base64");
  const decoded = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    decoded[i] =
      (bytes[i] ?? 0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
  }
  return JSON.parse(decoded.toString("utf8")) as ZkPlayerConfig;
}

// Fetch + decode the player config for a specific MAL ID + episode + type.
// Returns null when the episode doesn't exist (zokoanime returns a small
// error page without window.__P for out-of-range episodes) — callers use
// this null signal for binary-search episode enumeration.
async function fetchPlayerConfig(
  malId: number,
  episode: number,
  type: "sub" | "dub",
): Promise<ZkPlayerConfig | null> {
  const url = `${BASE}/stream/mal/${malId}/${episode}/${type}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`zokoanime: fetch ${res.status} ${url}`);
  const html = await res.text();
  const m = html.match(/window\.__P\s*=\s*"([^"]+)"/);
  const blob = m?.[1];
  if (!blob) return null;
  return decodePlayerConfig(blob);
}

// Probe whether a specific episode exists on zokoanime (sub type).
// Used by the binary-search episode enumerator. Never throws — a fetch
// error is treated as "episode missing" so the search still terminates.
async function episodeExists(malId: number, ep: number): Promise<boolean> {
  try {
    return (await fetchPlayerConfig(malId, ep, "sub")) !== null;
  } catch {
    return false;
  }
}

// ---- Episode count resolution ----

// AniList ID → MAL ID + episode count. AniList GraphQL is the source of
// truth for both. Cached 30 min so we don't refetch on every episode list
// / stream call for the same anime.
type AniListInfo = {
  malId: number | null;
  episodes: number | null;
  // Next episode to air (ongoing shows). current available = next - 1.
  nextAiringEpisode: number | null;
};
const anilistCache = new Map<number, { info: AniListInfo; expires: number }>();
const ANILIST_CACHE_TTL = 30 * 60 * 1000;

async function getAniListInfo(anilistId: number): Promise<AniListInfo> {
  const cached = anilistCache.get(anilistId);
  if (cached && Date.now() < cached.expires) return cached.info;
  const anime = await getAnime(anilistId);
  const info: AniListInfo = {
    malId: anime.idMal,
    episodes: anime.episodes,
    nextAiringEpisode: anime.nextAiringEpisode?.episode ?? null,
  };
  anilistCache.set(anilistId, {
    info,
    expires: Date.now() + ANILIST_CACHE_TTL,
  });
  return info;
}

// MAL ID → max episode number available on zokoanime. Cached 1 hour.
// Used when AniList's episode count is null (ongoing shows).
const maxEpisodeCache = new Map<number, { max: number; expires: number }>();
const MAX_EP_CACHE_TTL = 60 * 60 * 1000;
const MAX_PROBE_EPISODE = 2000; // sanity cap — no anime has > 2000 eps

// Binary search for the highest episode number zokoanime has for a MAL ID.
// Exponential search outward (1, 2, 4, 8, ...) to find an upper bound where
// the episode doesn't exist, then binary search between the last-existing
// and first-missing to pin the exact max. O(log N) requests — for One Piece
// (~1122 eps) this is ~22 sequential probes, ~10-15s on first hit, then
// cached for an hour.
async function findMaxEpisode(malId: number): Promise<number> {
  const cached = maxEpisodeCache.get(malId);
  if (cached && Date.now() < cached.expires) return cached.max;

  // Confirm ep 1 exists — if not, zokoanime doesn't have this show at all.
  if (!(await episodeExists(malId, 1))) {
    maxEpisodeCache.set(malId, {
      max: 0,
      expires: Date.now() + MAX_EP_CACHE_TTL,
    });
    return 0;
  }

  // Exponential search for upper bound (first ep that doesn't exist).
  let lo = 1;
  let hi = 2;
  while (hi <= MAX_PROBE_EPISODE && (await episodeExists(malId, hi))) {
    lo = hi;
    hi *= 2;
  }
  if (hi > MAX_PROBE_EPISODE) hi = MAX_PROBE_EPISODE;

  // Binary search between lo (exists) and hi (doesn't exist) to find max.
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await episodeExists(malId, mid)) lo = mid;
    else hi = mid;
  }

  maxEpisodeCache.set(malId, {
    max: lo,
    expires: Date.now() + MAX_EP_CACHE_TTL,
  });
  return lo;
}

async function findEpisodes(ref: AnimeRef): Promise<Episode[] | null> {
  const info = await getAniListInfo(ref.anilistId);
  if (!info.malId) return null;

  // Episode count resolution priority:
  //   1. AniList Media.episodes (completed shows, planned counts)
  //   2. AniList nextAiringEpisode.episode - 1 (ongoing shows — next ep to air
  //      means N-1 episodes are currently released)
  //   3. Binary-search probe of zokoanime (only when both are null — rare)
  let maxEp: number;
  if (info.episodes && info.episodes > 0) {
    maxEp = info.episodes;
  } else if (info.nextAiringEpisode && info.nextAiringEpisode > 1) {
    maxEp = info.nextAiringEpisode - 1;
  } else {
    maxEp = await findMaxEpisode(info.malId);
  }
  if (maxEp < 1) return null;

  // Generate episodes 1..maxEp. id = episode number (string), slug = MAL ID
  // (so the watch URL carries it), animeId = MAL ID (passed via ?aid=).
  const eps: Episode[] = [];
  for (let n = 1; n <= maxEp; n++) {
    eps.push({
      id: String(n),
      number: n,
      animeId: info.malId,
      slug: String(info.malId),
    });
  }
  return eps;
}

// Stream extraction: fetch the player config for the requested episode.
// Prefers "sub" (JP audio + EN softsubs); falls back to "dub" if sub is
// missing for this episode (rare — usually only on simulcast dubs).
async function getStream(req: StreamRequest): Promise<StreamResult> {
  // animeId from ?aid= is the MAL ID (set by findEpisodes). Fall back to
  // parsing slug (also the MAL ID) for old URLs without ?aid=.
  const malId = req.animeId || Number(req.slug);
  if (!malId || !Number.isSafeInteger(malId)) {
    throw new Error(
      `zokoanime: missing/invalid MAL ID (animeId=${req.animeId} slug=${req.slug})`,
    );
  }
  const episode = Number(req.episodeId);
  if (!episode || !Number.isSafeInteger(episode)) {
    throw new Error(`zokoanime: bad episodeId "${req.episodeId}"`);
  }

  let cfg = await fetchPlayerConfig(malId, episode, "sub");
  if (!cfg) cfg = await fetchPlayerConfig(malId, episode, "dub");
  if (!cfg) {
    throw new Error(
      `zokoanime: episode ${episode} not found for MAL ${malId} (sub + dub both missing)`,
    );
  }
  if (!cfg.src) throw new Error("zokoanime: no stream src in player config");

  const subtitles: SubtitleTrack[] = (cfg.subtitles ?? [])
    .filter((s) => s?.src)
    .map((s) => ({
      url: s.src as string,
      language: s.lang ?? "en",
      label: s.label ?? s.lang ?? "English",
      format: "vtt" as const,
    }));

  // Referer must be the zokoanime embed URL — both the HLS CDN
  // (hls.dramahot.top) and the VTT subtitle CDN 403 without it.
  const referer = `${BASE}/stream/mal/${malId}/${episode}/sub`;

  return {
    hls: cfg.src,
    referer,
    subtitles,
  };
}

export const zokoanimeProvider: Provider = {
  name: "zokoanime",
  findEpisodes,
  getStream,
};
