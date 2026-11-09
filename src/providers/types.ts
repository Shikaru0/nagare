// Provider-agnostic episode interface.

export type Episode = {
  id: string;
  number: number;
  title?: string;
  isFiller?: boolean;
  thumbnail?: string;
  animeId?: number;
  slug?: string;
};

export type AnimeRef = {
  anilistId: number;
  title: string;
};

export type StreamRequest = {
  animeId: number;
  slug: string;
  episodeId: string;
};

export type StreamResult = {
  url: string;
  referer: string;
};

export type Provider = {
  name: string;
  findEpisodes(ref: AnimeRef): Promise<Episode[] | null>;
  getStream(req: StreamRequest): Promise<StreamResult>;
};

export type EpisodeResult = {
  provider: string | null;
  episodes: Episode[];
  error?: string;
};
