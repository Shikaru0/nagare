// Provider registry. Order matters — first hit wins.

import { animeUnityProvider } from "./animeunity";
import type { AnimeRef, EpisodeResult, Provider } from "./types";

export type {
  AnimeRef,
  Episode,
  EpisodeResult,
  Provider,
  StreamRequest,
  StreamResult,
} from "./types";

export const providers: Provider[] = [animeUnityProvider];

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
      // provider failed; try next one, but record the error for debugging
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    provider: null,
    episodes: [],
    error: errors.length ? errors.join("; ") : "no matches",
  };
}
