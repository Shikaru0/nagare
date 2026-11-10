// Provider registry. Order matters — first hit wins.

import { animeUnityProvider } from "./animeunity";
import { anizoneProvider } from "./anizone";
import type { AnimeRef, EpisodeResult, Provider } from "./types";
import { zokoanimeProvider } from "./zokoanime";

export type {
  AnimeRef,
  Episode,
  EpisodeResult,
  Provider,
  StreamRequest,
  StreamResult,
  SubtitleTrack,
} from "./types";

export const providers: Provider[] = [
  zokoanimeProvider,
  anizoneProvider,
  animeUnityProvider,
];

export function getProvider(name: string): Provider | undefined {
  return providers.find((p) => p.name === name);
}

// Try each provider in order. Returns the first non-empty result.
// If all providers error or return null, returns empty episodes with error.
export async function findEpisodes(ref: AnimeRef): Promise<EpisodeResult> {
  const errors: string[] = [];

  for (const p of providers) {
    try {
      const eps = await p.findEpisodes(ref);
      if (eps && eps.length > 0) {
        return { provider: p.name, episodes: eps };
      }
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    provider: null,
    episodes: [],
    error: errors.length ? errors.join("; ") : "no matches",
  };
}

// Fetch episodes from one specific provider (for manual provider switching).
// Returns null result if that provider has no episodes.
export async function findEpisodesFrom(
  providerName: string,
  ref: AnimeRef,
): Promise<EpisodeResult> {
  const p = getProvider(providerName);
  if (!p)
    return {
      provider: null,
      episodes: [],
      error: `unknown provider: ${providerName}`,
    };
  try {
    const eps = await p.findEpisodes(ref);
    if (eps && eps.length > 0) return { provider: p.name, episodes: eps };
    return {
      provider: null,
      episodes: [],
      error: `${providerName}: no episodes`,
    };
  } catch (e) {
    return {
      provider: null,
      episodes: [],
      error: `${providerName}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
