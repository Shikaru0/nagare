// MangaDex scraper — https://api.mangadex.org (official public API v5)
//
// No Cloudflare, no scraping. The API returns structured JSON for:
//   - Search:  GET /manga?title={query} → manga list with UUIDs
//   - Feed:    GET /manga/{id}/feed?translatedLanguage[]=en&order[chapter]=asc
//   - Pages:   GET /at-home/server/{chapterId} → { baseUrl, hash, data: [files] }
//
// Page images are served from uploads.mangadex.network CDN — no Referer
// required, so the frontend loads them directly via <img src>. No proxy.
//
// AniList → MangaDex mapping: search by title, verify via attributes.links.mal
// (MangaDex stores the MAL ID on each manga). Falls back to first result.

import { getManga } from "../anilist";
import type {
  Chapter,
  MangaProvider,
  MangaRef,
  PageRequest,
  PageResult,
} from "./types";

const API = "https://api.mangadex.org";

// No User-Agent header — MangaDex's Cloudflare challenges the Chrome UA
// string (returns an HTML interstitial instead of JSON). Bun's default
// fetch UA passes through fine.
const HEADERS = {
  Accept: "application/json",
};

type MdManga = {
  id: string;
  attributes: {
    title: Record<string, string>;
    links?: { mal?: string };
  };
};

type MdChapter = {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    pages: number;
    translatedLanguage: string;
  };
};

type MdFeedResponse = { data: MdChapter[]; total: number };
type MdSearchResponse = { data: MdManga[] };
type MdAtHomeResponse = {
  baseUrl: string;
  chapter: { hash: string; data: string[] };
};

// AniList ID → { malId, title }. Cached 30 min (same pattern as zokoanime).
const anilistCache = new Map<
  number,
  { info: { malId: number | null; title: string }; expires: number }
>();
const ANILIST_CACHE_TTL = 30 * 60 * 1000;

async function getAniListMangaInfo(
  anilistId: number,
): Promise<{ malId: number | null; title: string }> {
  const cached = anilistCache.get(anilistId);
  if (cached && Date.now() < cached.expires) return cached.info;
  const manga = await getManga(anilistId);
  const info = {
    malId: manga.idMal,
    title: manga.title.english ?? manga.title.romaji,
  };
  anilistCache.set(anilistId, {
    info,
    expires: Date.now() + ANILIST_CACHE_TTL,
  });
  return info;
}

// Search MangaDex by title. Returns the manga UUID + MAL link (if any).
async function searchMangaDex(
  title: string,
): Promise<{ id: string; malLink?: string } | null> {
  const url = new URL(`${API}/manga`);
  url.searchParams.set("title", title);
  url.searchParams.set("limit", "5");
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`mangadex: search ${res.status}`);
  const data = (await res.json()) as MdSearchResponse;
  if (data.data.length === 0) return null;
  const first = data.data[0];
  if (!first) return null;
  return { id: first.id, malLink: first.attributes.links?.mal };
}

// Fetch the chapter feed for a MangaDex manga UUID.
// Filters to English, deduplicates by chapter number (multiple scanlation
// groups often upload the same chapter — we keep the first one per number),
// and sorts the final list numerically (MangaDex sorts chapter numbers as
// strings, so "100" comes before "98" in the raw API response).
//
// Paginates through all results — the API caps at 500 per request, and a
// long manga with multiple uploads per chapter can easily exceed that.
async function fetchChapterFeed(mangaDexId: string): Promise<Chapter[]> {
  const limit = 500;
  const raw: MdChapter[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${API}/manga/${mangaDexId}/feed`);
    url.searchParams.set("translatedLanguage[]", "en");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order[chapter]", "asc");
    // append (not set) so all three ratings are included — set() would
    // overwrite, leaving only the last value.
    url.searchParams.append("contentRating[]", "safe");
    url.searchParams.append("contentRating[]", "suggestive");
    url.searchParams.append("contentRating[]", "erotica");
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`mangadex: feed ${res.status}`);
    const data = (await res.json()) as MdFeedResponse;

    raw.push(...data.data);
    // Stop if we've fetched everything or this page was partial.
    if (raw.length >= data.total || data.data.length < limit) break;
    offset += limit;
  }

  const seen = new Set<number>();
  const chapters: Chapter[] = [];
  for (const ch of raw) {
    // Skip chapters with 0 pages (deleted/external placeholders that
    // can't be read via the at-home server).
    if (ch.attributes.pages <= 0) continue;
    const num = Number(ch.attributes.chapter);
    if (!Number.isFinite(num) || seen.has(num)) continue;
    seen.add(num);
    chapters.push({
      id: ch.id,
      number: num,
      title: ch.attributes.title || undefined,
      pages: ch.attributes.pages,
      language: ch.attributes.translatedLanguage,
      mangaId: 0,
      slug: mangaDexId,
    });
  }
  // Sort numerically — the API sorts chapter as a string, so "100" would
  // appear before "98" without this.
  chapters.sort((a, b) => a.number - b.number);
  return chapters;
}

async function findMangaDexId(ref: MangaRef): Promise<string | null> {
  const info = await getAniListMangaInfo(ref.anilistId);

  // Try to find by MAL ID first (exact match). MangaDex doesn't have a
  // direct "search by mal id" endpoint, but we can search by title and
  // verify the links.mal field matches.
  const result = await searchMangaDex(info.title);
  if (!result) return null;

  // If AniList gave us a MAL ID, prefer the manga whose links.mal matches.
  if (info.malId && result.malLink === String(info.malId)) return result.id;

  // Fallback: search again with more results and look for the MAL match.
  if (info.malId) {
    const url = new URL(`${API}/manga`);
    url.searchParams.set("title", info.title);
    url.searchParams.set("limit", "20");
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const data = (await res.json()) as MdSearchResponse;
      const match = data.data.find(
        (m) => m.attributes.links?.mal === String(info.malId),
      );
      if (match) return match.id;
    }
  }

  return result.id;
}

async function findChapters(ref: MangaRef): Promise<Chapter[] | null> {
  const mangaDexId = await findMangaDexId(ref);
  if (!mangaDexId) return null;
  return fetchChapterFeed(mangaDexId);
}

// Fetch chapters directly by MangaDex manga UUID — skips the title search.
// Used by the read page to refresh the chapter dropdown without AniList.
async function findChaptersBySlug(slug: string): Promise<Chapter[] | null> {
  return fetchChapterFeed(slug);
}

async function getPages(req: PageRequest): Promise<PageResult> {
  const res = await fetch(`${API}/at-home/server/${req.chapterId}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`mangadex: at-home ${res.status}`);
  const data = (await res.json()) as MdAtHomeResponse;

  // Page URL pattern: {baseUrl}/data/{hash}/{filename}
  // dataSaver variant would use /data-saver/ for compressed images —
  // we use the full-quality /data/ for now.
  const pages = data.chapter.data.map(
    (filename) => `${data.baseUrl}/data/${data.chapter.hash}/${filename}`,
  );

  // MangaDex CDN doesn't require a Referer — pages load directly via <img>.
  return { pages, referer: "" };
}

export const mangadexProvider: MangaProvider = {
  name: "mangadex",
  findChapters,
  findChaptersBySlug,
  getPages,
};
