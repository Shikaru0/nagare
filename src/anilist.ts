const ANILIST_URL = "https://graphql.anilist.co";

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data as T;
}

export type AnimeSummary = {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null };
  coverImage: { large: string };
  seasonYear: number | null;
};

export type AnimeDetail = AnimeSummary & {
  description: string | null;
  bannerImage: string | null;
  episodes: number | null;
  // For ongoing shows (status=RELEASING), AniList exposes the next episode
  // to air. nextAiringEpisode.episode - 1 = current available episode count.
  // Used by providers (e.g. zokoanime) to enumerate episodes without probing.
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  averageScore: number | null;
  genres: string[];
  status: string | null;
};

export function searchAnime(q: string) {
  return gql<{ Page: { media: AnimeSummary[] } }>(
    `
    query($search: String) {
      Page(perPage: 12) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
          id idMal title { romaji english }
          coverImage { large } seasonYear
        }
      }
    }`,
    { search: q },
  ).then((d) => d.Page.media);
}

export function getAnime(id: number) {
  return gql<{ Media: AnimeDetail }>(
    `
    query($id: Int) {
      Media(id: $id, type: ANIME) {
        id idMal title { romaji english }
        coverImage { large } seasonYear
        description bannerImage episodes averageScore
        nextAiringEpisode { episode airingAt }
        genres status
      }
    }`,
    { id },
  ).then((d) => d.Media);
}

// -- Manga (type: MANGA) — same AniList API, different type filter.
// Manga has `chapters` instead of `episodes`, no nextAiringEpisode.

export type MangaSummary = {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null };
  coverImage: { large: string };
  seasonYear: number | null;
};

export type MangaDetail = MangaSummary & {
  description: string | null;
  bannerImage: string | null;
  chapters: number | null;
  averageScore: number | null;
  genres: string[];
  status: string | null;
};

export function searchManga(q: string) {
  return gql<{ Page: { media: MangaSummary[] } }>(
    `
    query($search: String) {
      Page(perPage: 12) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
          id idMal title { romaji english }
          coverImage { large } seasonYear
        }
      }
    }`,
    { search: q },
  ).then((d) => d.Page.media);
}

export function getManga(id: number) {
  return gql<{ Media: MangaDetail }>(
    `
    query($id: Int) {
      Media(id: $id, type: MANGA) {
        id idMal title { romaji english }
        coverImage { large } seasonYear
        description bannerImage chapters averageScore
        genres status
      }
    }`,
    { id },
  ).then((d) => d.Media);
}
