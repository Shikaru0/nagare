import { expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  animeProgress,
  continueAnime,
  continueManga,
  getAnimeProgress,
  getMangaProgress,
  isChapterRead,
  isEpisodeWatched,
  markChapterRead,
  markEpisodeWatched,
  mangaProgress,
  updateAnimeProgress,
  updateMangaProgress,
} from "./progress";

test("anime progress reads see same-session updates", () => {
  updateAnimeProgress({
    anilistId: 991001,
    title: "Test Anime",
    cover: "",
    provider: "zokoanime",
    episodeId: "2",
    episodeNumber: 2,
    positionSec: 30,
    durationSec: 1400,
    updatedAt: Date.now(),
  });
  markEpisodeWatched(991001, 2);

  expect(getAnimeProgress(991001)?.episodeId).toBe("2");
  expect(isEpisodeWatched(991001, 2)).toBe(true);
  expect(continueAnime(get(animeProgress))[0]?.episodeNumber).toBe(2);
});

test("manga progress reads see same-session updates", () => {
  updateMangaProgress({
    anilistId: 991002,
    title: "Test Manga",
    cover: "",
    provider: "mangadex",
    chapterId: "ch-2",
    chapterNumber: 2,
    scrollPct: 0.5,
    updatedAt: Date.now(),
  });
  markChapterRead(991002, 2);

  expect(getMangaProgress(991002)?.chapterId).toBe("ch-2");
  expect(isChapterRead(991002, 2)).toBe(true);
  expect(continueManga(get(mangaProgress))[0]?.chapterNumber).toBe(2);
});
