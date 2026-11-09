// AnimeUnity scraper. Behind Cloudflare + Laravel CSRF — fetch homepage
// for a session cookie + csrf token, send both on the search POST.

import type { AnimeRef, Episode, Provider, StreamRequest, StreamResult } from "./types";

const BASE = "https://www.animeunity.co";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// Session cookies + csrf are bound together; cache 30 min so we don't
// refetch the homepage on every search.
type Session = { cookies: string; csrf: string; expires: number };
let session: Session | null = null;

async function getSession(): Promise<Session> {
  if (session && Date.now() < session.expires) return session;
  const res = await fetch(BASE, { headers: HEADERS });
  if (!res.ok) throw new Error(`AU session ${res.status}`);
  const html = await res.text();

  const csrf = html.match(/csrf-token"\s+content="([^"]+)"/)?.[1];
  if (!csrf) throw new Error("AU: no csrf-token meta tag");

  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookies) throw new Error("AU: no session cookies");

  session = { cookies, csrf, expires: Date.now() + 30 * 60 * 1000 };
  return session;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`AU fetch ${res.status}`);
  return res.text();
}

type AuRecord = {
  id: number;
  title: string | null;
  title_eng: string | null;
  slug: string;
  anilist_id: number | null;
  mal_id: number | null;
};

// POST /livesearch — returns JSON {records: [...]} matching the title substring.
async function searchAU(title: string): Promise<AuRecord[]> {
  const s = await getSession();
  const res = await fetch(`${BASE}/livesearch`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-TOKEN": s.csrf,
      Cookie: s.cookies,
      Referer: `${BASE}/`,
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      Accept: "application/json, text/plain, */*",
    },
    body: `title=${encodeURIComponent(title)}`,
  });
  if (!res.ok) throw new Error(`AU search ${res.status}`);
  const data = (await res.json()) as { records?: AuRecord[] };
  return data.records ?? [];
}

// AU HTML-encodes JSON inside attributes — decode before JSON.parse.
function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last to avoid double-decoding &amp;quot;
}

type AuEpisode = {
  id: string | number;
  number: number;
  file_name?: string;
  scws_id?: number;
};

async function auEpisodes(record: AuRecord): Promise<Episode[]> {
  const html = await fetchHtml(`${BASE}/anime/${record.id}-${record.slug}`);
  const m = html.match(/<video-player[^>]*\bepisodes=(['"])(.+?)\1/);
  const raw = m?.[2];
  if (!raw) throw new Error("AU: no <video-player episodes> found");

  const json = decodeHtml(raw);
  let parsed: AuEpisode[];
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`AU: episodes JSON parse failed (first 200: ${json.slice(0, 200)})`);
  }

  return parsed.map((e) => ({
    id: String(e.id),
    number: e.number,
    title: e.file_name ?? undefined,
    animeId: record.id,
    slug: record.slug,
  }));
}

// Search with first word of title (livesearch matches substrings, so a
// short query returns more candidates), then pick the right record by
// anilist_id. Falls back to title match if AU has no ID.
async function findEpisodes(ref: AnimeRef): Promise<Episode[] | null> {
  const query = ref.title.split(/\s+/)[0] ?? ref.title;
  const records = await searchAU(query);
  if (!records.length) return null;

  const picked =
    records.find((r) => r.anilist_id === ref.anilistId) ??
    records.find(
      (r) =>
        r.title_eng?.toLowerCase() === ref.title.toLowerCase() ||
        r.title?.toLowerCase() === ref.title.toLowerCase(),
    ) ??
    records[0];
  if (!picked) return null;
  return auEpisodes(picked);
}

// Stream extraction:
// 1. Fetch /embed-url/{episodeId} — AU's own API, returns a fresh vixcloud
//    embed URL with a per-episode token. (The embed_url on the anime page
//    is hardcoded to ep 1's token — swapping scws_id breaks other eps.)
// 2. Fetch the vixcloud embed page (Referer: animeunity)
// 3. Extract HLS playlist URL (preferred) + MP4 downloadUrl (fallback)
//    Both go through /api/proxy in the frontend to bypass CORS.
async function getStream(req: StreamRequest): Promise<StreamResult> {
  const s = await getSession();
  const embedRes = await fetch(`${BASE}/embed-url/${req.episodeId}`, {
    headers: {
      ...HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: s.cookies,
      Referer: `${BASE}/anime/${req.animeId}-${req.slug}`,
    },
  });
  if (!embedRes.ok) throw new Error(`AU: embed-url ${embedRes.status}`);
  const streamEmbedUrl = (await embedRes.text()).trim();

  const vixRes = await fetch(streamEmbedUrl, {
    headers: { ...HEADERS, Referer: `${BASE}/` },
  });
  if (!vixRes.ok) throw new Error(`AU: vixcloud fetch ${vixRes.status}`);
  const vixHtml = await vixRes.text();

  // HLS: playlist URL + token+expires from the embed page JS.
  // Currently 403s on direct fetch (vixcloud has session-bound auth we
  // haven't cracked yet) — but we still return it so the frontend can
  // try, then fall back to mp4.
  const playlistMatch = vixHtml.match(
    /url:\s*['"](https:\/\/vixcloud\.cc\/playlist\/\d+)['"]/,
  );
  const token = vixHtml.match(/['"]token['"]\s*:\s*['"]([a-f0-9]+)['"]/)?.[1];
  const expires = vixHtml.match(/['"]expires['"]\s*:\s*['"](\d+)['"]/)?.[1];
  const hls =
    playlistMatch?.[1] && token && expires
      ? `${playlistMatch[1]}?token=${token}&expires=${expires}`
      : undefined;

  // MP4: direct downloadUrl on vix-content.net CDN — no auth needed,
  // works as a reliable fallback (single quality, Italian hardsubs).
  const mp4 = vixHtml.match(/downloadUrl\s*=\s*['"]([^'"]+)['"]/)?.[1];

  if (!hls && !mp4) throw new Error("AU: no stream URLs in vixcloud page");

  return { hls, mp4, referer: "https://vixcloud.cc/" };
}

export const animeUnityProvider: Provider = {
  name: "animeunity",
  findEpisodes,
  getStream,
};
