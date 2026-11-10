// Manga provider interface — mirrors the anime Provider in src/providers/types.ts
// but returns chapters + page images instead of episodes + video streams.

export type Chapter = {
  id: string; // provider chapter ID (e.g. MangaDex chapter UUID)
  number: number; // chapter number (parsed from string)
  title?: string;
  pages: number; // page count
  language: string; // translated language code (e.g. "en", "ja")
  mangaId?: number; // provider's internal manga ID (0 if unused)
  slug?: string; // provider manga slug (for URL + slug-based lookup)
};

export type MangaRef = {
  anilistId: number;
  title: string;
};

export type PageRequest = {
  chapterId: string;
};

// MangaDex serves page images from a CDN that doesn't require a Referer,
// so referer is empty — but we keep it in the type for future providers
// that might need it (same pattern as anime StreamResult).
export type PageResult = {
  pages: string[]; // image URLs (load directly via <img src>)
  referer: string;
};

export type MangaProvider = {
  name: string;
  findChapters(ref: MangaRef): Promise<Chapter[] | null>;
  getPages(req: PageRequest): Promise<PageResult>;
  // Fetch chapters directly by the provider's manga slug — skips the
  // AniList title search. Used by the read page to refresh the chapter
  // dropdown without the AniList title. Optional.
  findChaptersBySlug?(slug: string): Promise<Chapter[] | null>;
};

export type ChapterResult = {
  provider: string | null;
  chapters: Chapter[];
  error?: string;
};
