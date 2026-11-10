// AniZone scraper
//
// Flow: search /anime?search={title} → episodes /anime/{slug} →
// stream /anime/{slug}/{ep} (m3u8 + subtitles embedded in page HTML).

import type {
  AnimeRef,
  Episode,
  Provider,
  StreamRequest,
  StreamResult,
} from "./types";

const BASE = "https://anizone.to";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// AniZone HTML-encodes JSON inside JSON.parse('...') calls. The encoding
// uses \u0022 for " and \/ for /. Decode before JSON.parse.
function decodeJson(raw: string): string {
  return raw
    .replace(/\\u0022/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

// Extract all JSON.parse('...') blobs from the HTML, return the first
// one that parses to the expected shape.
function extractJsonArray<T>(
  html: string,
  check: (item: unknown) => item is T,
): T[] {
  for (const m of html.matchAll(/JSON\.parse\('([^']+)'\)/g)) {
    try {
      const data = JSON.parse(decodeJson(m[1] ?? ""));
      if (Array.isArray(data) && (data.length === 0 || check(data[0]))) {
        return data as T[];
      }
    } catch {
      // not valid JSON, try next
    }
  }
  return [];
}

type AzSearchResult = {
  slug: string;
  url: string;
  main_title: string;
  title_list: Record<string, string>;
};

type AzEpisode = {
  slug: string;
  url: string;
  title_list: Record<string, string>;
};

type AzPlayerData = {
  src: string;
  subtitles?: {
    file: string;
    language: string;
    format: string;
    default?: boolean;
  }[];
};

function isSearchResult(v: unknown): v is AzSearchResult {
  return (
    typeof v === "object" && v !== null && "slug" in v && "main_title" in v
  );
}

function isEpisode(v: unknown): v is AzEpisode {
  return (
    typeof v === "object" &&
    v !== null &&
    "slug" in v &&
    "url" in v &&
    !("main_title" in v)
  );
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`anizone: fetch ${res.status} ${url}`);
  return res.text();
}

// Search by title, then pick the result whose title_list best matches
// the AniList title. Falls back to the first result if no exact match.
async function findAnime(ref: AnimeRef): Promise<AzSearchResult | null> {
  const html = await fetchHtml(
    `${BASE}/anime?search=${encodeURIComponent(ref.title)}`,
  );
  const results = extractJsonArray(html, isSearchResult);
  if (results.length === 0) return null;

  // Try exact match on any title_list language (1=en, 5=romaji, 8=jp)
  const lower = ref.title.toLowerCase();
  const exact = results.find(
    (r) =>
      r.main_title?.toLowerCase() === lower ||
      Object.values(r.title_list).some((t) => t?.toLowerCase() === lower),
  );
  return exact ?? results[0] ?? null;
}

async function findEpisodes(ref: AnimeRef): Promise<Episode[] | null> {
  const anime = await findAnime(ref);
  if (!anime) return null;
  return findEpisodesBySlug(anime.slug);
}

// Fetch episodes directly by the anizone anime slug — skips the title
// search. Used by the watch page to populate the episode dropdown
// without needing the AniList title.
async function findEpisodesBySlug(slug: string): Promise<Episode[] | null> {
  const html = await fetchHtml(`${BASE}/anime/${slug}`);
  const eps = extractJsonArray(html, isEpisode);
  if (eps.length === 0) return null;

  return eps.map((e) => ({
    id: e.slug,
    number: Number(e.slug) || 0,
    title: e.title_list?.["1"] ?? e.title_list?.["5"],
    animeId: 0,
    slug,
  }));
}

async function getStream(req: StreamRequest): Promise<StreamResult> {
  // req.slug is the anizone anime slug, req.episodeId is the episode slug
  const html = await fetchHtml(`${BASE}/anime/${req.slug}/${req.episodeId}`);

  const m = html.match(/Player\(JSON\.parse\('([^']+)'\)/);
  if (!m) throw new Error("anizone: no Player() in episode page");
  const data = JSON.parse(decodeJson(m[1] ?? "")) as AzPlayerData;

  if (!data.src) throw new Error("anizone: no stream src");

  const subtitles = data.subtitles?.map((s) => ({
    url: s.file,
    language: s.language,
    label: s.language,
    format: (s.format as "vtt" | "srt" | "ass") ?? undefined,
  }));

  return {
    hls: data.src,
    referer: `${BASE}/anime/${req.slug}/${req.episodeId}`,
    subtitles,
  };
}

export const anizoneProvider: Provider = {
  name: "anizone",
  findEpisodes,
  findEpisodesBySlug,
  getStream,
};
