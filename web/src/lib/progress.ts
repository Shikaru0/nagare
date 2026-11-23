// localStorage-backed watch/read progress. No backend, no auth.
// Keys are AniList media IDs. One record per (media, episode/chapter).
// Records are kept small so the store stays cheap even with thousands of
// entries — only what's needed to render continue-rails and seek on load.

import { get, writable } from "svelte/store";

const ANIME_KEY = "nagare:progress:anime";
const MANGA_KEY = "nagare:progress:manga";

export type AnimeProgress = {
  anilistId: number;
  title: string; // english ?? romaji at time of recording (for the rail)
  cover: string; // coverImage.large at time of recording
  provider: string;
  episodeId: string;
  episodeNumber: number;
  positionSec: number;
  durationSec: number;
  updatedAt: number; // ms epoch
};

export type MangaProgress = {
  anilistId: number;
  title: string;
  cover: string;
  provider: string;
  chapterId: string;
  chapterNumber: number;
  scrollPct: number; // 0..1
  updatedAt: number;
};

// Map<anilistId, AnimeProgress> — one record per anime, the latest episode.
// For "watched" tracking we keep a Set of finished episode ids separately.
type AnimeStore = {
  byId: Record<number, AnimeProgress>;
  watched: Record<string, true>; // key: `${anilistId}:${episodeNumber}`
};

type MangaStore = {
  byId: Record<number, MangaProgress>;
  read: Record<string, true>; // key: `${anilistId}:${chapterNumber}`
};

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or disabled — ignore, progress is best-effort
  }
}

const initialAnime: AnimeStore = load<AnimeStore>(ANIME_KEY, {
  byId: {},
  watched: {},
});
const initialManga: MangaStore = load<MangaStore>(MANGA_KEY, {
  byId: {},
  read: {},
});

export const animeProgress = writable<AnimeStore>(initialAnime);
export const mangaProgress = writable<MangaStore>(initialManga);

animeProgress.subscribe((v) => save(ANIME_KEY, v));
mangaProgress.subscribe((v) => save(MANGA_KEY, v));

// -- Anime -----------------------------------------------------------------

export function updateAnimeProgress(p: AnimeProgress) {
  animeProgress.update((s) => {
    const prev = s.byId[p.anilistId];
    // Don't regress to an earlier episode if a newer one was already recorded.
    if (prev && prev.episodeNumber > p.episodeNumber) return s;
    return {
      ...s,
      byId: { ...s.byId, [p.anilistId]: { ...p, updatedAt: Date.now() } },
    };
  });
}

export function markEpisodeWatched(anilistId: number, episodeNumber: number) {
  animeProgress.update((s) => ({
    ...s,
    watched: { ...s.watched, [`${anilistId}:${episodeNumber}`]: true },
  }));
}

export function isEpisodeWatched(anilistId: number, episodeNumber: number) {
  return Boolean(get(animeProgress).watched[`${anilistId}:${episodeNumber}`]);
}

export function getAnimeProgress(anilistId: number): AnimeProgress | null {
  return get(animeProgress).byId[anilistId] ?? null;
}

// -- Manga -----------------------------------------------------------------

export function updateMangaProgress(p: MangaProgress) {
  mangaProgress.update((s) => {
    const prev = s.byId[p.anilistId];
    if (prev && prev.chapterNumber > p.chapterNumber) return s;
    return {
      ...s,
      byId: { ...s.byId, [p.anilistId]: { ...p, updatedAt: Date.now() } },
    };
  });
}

export function markChapterRead(anilistId: number, chapterNumber: number) {
  mangaProgress.update((s) => ({
    ...s,
    read: { ...s.read, [`${anilistId}:${chapterNumber}`]: true },
  }));
}

export function isChapterRead(anilistId: number, chapterNumber: number) {
  return Boolean(get(mangaProgress).read[`${anilistId}:${chapterNumber}`]);
}

export function getMangaProgress(anilistId: number): MangaProgress | null {
  return get(mangaProgress).byId[anilistId] ?? null;
}

// -- Continue rails --------------------------------------------------------

// Callers passing a store snapshot (e.g. `$animeProgress` in a component)
// make the rails reactive; the default reads the latest value on demand.
export function continueAnime(
  store: AnimeStore = get(animeProgress),
  limit = 8,
): AnimeProgress[] {
  return Object.values(store.byId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function continueManga(
  store: MangaStore = get(mangaProgress),
  limit = 8,
): MangaProgress[] {
  return Object.values(store.byId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
