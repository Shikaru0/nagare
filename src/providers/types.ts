// Provider-agnostic episode interface.

export type Episode = {
  id: string; // provider-specific episode id, used for the watch endpoint
  number: number;
  title?: string;
  isFiller?: boolean;
  thumbnail?: string;
};

// What providers need to find the right anime. anilistId is preferred (exact match);
// title is a fallback for providers that don't support IDs.
export type AnimeRef = {
  anilistId: number;
  title: string;
};

export type Provider = {
  name: string;
  findEpisodes(ref: AnimeRef): Promise<Episode[] | null>;
};

export type EpisodeResult = {
  provider: string | null;
  episodes: Episode[];
  error?: string;
};
