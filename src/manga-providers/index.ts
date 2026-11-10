// Manga provider registry — same first-hit-wins pattern as src/providers/index.ts.

import { mangadexProvider } from "./mangadex";
import type { ChapterResult, MangaProvider, MangaRef } from "./types";

export type {
  Chapter,
  ChapterResult,
  MangaProvider,
  MangaRef,
  PageRequest,
  PageResult,
} from "./types";

export const mangaProviders: MangaProvider[] = [mangadexProvider];

export function getMangaProvider(name: string): MangaProvider | undefined {
  return mangaProviders.find((p) => p.name === name);
}

// Try each provider in order. Returns the first non-empty result.
export async function findChapters(ref: MangaRef): Promise<ChapterResult> {
  const errors: string[] = [];

  for (const p of mangaProviders) {
    try {
      const chs = await p.findChapters(ref);
      if (chs && chs.length > 0) {
        return { provider: p.name, chapters: chs };
      }
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    provider: null,
    chapters: [],
    error: errors.length ? errors.join("; ") : "no matches",
  };
}

// Fetch chapters from one specific provider (for manual provider switching).
export async function findChaptersFrom(
  providerName: string,
  ref: MangaRef,
): Promise<ChapterResult> {
  const p = getMangaProvider(providerName);
  if (!p)
    return {
      provider: null,
      chapters: [],
      error: `unknown provider: ${providerName}`,
    };
  try {
    const chs = await p.findChapters(ref);
    if (chs && chs.length > 0) return { provider: p.name, chapters: chs };
    return {
      provider: null,
      chapters: [],
      error: `${providerName}: no chapters`,
    };
  } catch (e) {
    return {
      provider: null,
      chapters: [],
      error: `${providerName}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
