// Provider-agnostic episode + stream interface.

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

// HLS preferred (multi-quality, switchable subs), MP4 fallback (single
// quality, hardsubs). Provider returns whatever it can — at least one.
export type SubtitleTrack = {
  url: string;
  language: string;
  label: string;
  format?: "vtt" | "srt" | "ass";
};

export type StreamResult = {
  hls?: string;
  mp4?: string;
  referer: string;
  subtitles?: SubtitleTrack[];
};

export type Provider = {
  name: string;
  findEpisodes(ref: AnimeRef): Promise<Episode[] | null>;
  getStream(req: StreamRequest): Promise<StreamResult>;
  // Fetch episodes directly by the provider's slug (skips title search).
  // Used by the watch page to populate the episode dropdown without
  // needing the AniList title. Optional — providers that don't support
  // it return null.
  findEpisodesBySlug?(slug: string): Promise<Episode[] | null>;
};

export type EpisodeResult = {
  provider: string | null;
  episodes: Episode[];
  error?: string;
};
