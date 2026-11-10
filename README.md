# nagare

[![CI](https://github.com/Shikaru0/nagare/actions/workflows/ci.yml/badge.svg)](https://github.com/Shikaru0/nagare/actions/workflows/ci.yml)

Self-hosted anime streaming. AniList for metadata, in-house scrapers (`src/providers/`) for episodes.

## Dev

```bash
bun install
bun run dev   # api on :4141, vite on :5173
```

The API server (`src/index.ts`) serves the built SPA from `dist/` in production. Vite proxies `/api` to `:4141` in dev.

```bash
bun run build  # build SPA to dist/
bun run start  # serve dist/ + api on :4141
```

## Stack

- **Runtime**: Bun
- **Frontend**: Svelte 5 (runes) + Vite + Tailwind 4
- **Player**: hls.js (HLS), native `<video>` (MP4 fallback)
- **Lint/format**: Biome
- **Metadata**: AniList GraphQL API (search, info)
- **Providers**: ZokoAnime (`src/providers/zokoanime.ts`), AniZone (`src/providers/anizone.ts`), AnimeUnity (`src/providers/animeunity.ts`)

## Providers

Each provider implements `findEpisodes(ref)` and `getStream(req)`. The registry tries providers in order — first hit wins.

| Provider | Source | Audio | Subs | Cloudflare | Speed |
|---|---|---|---|---|---|
| `zokoanime` | zokoanime.video (embed) | JP | EN softsubs (toggleable VTT) | none | ~2s |
| `anizone` | anizone.to (scraper) | JP | EN & more (SRT→VTT) | none | ~3s |
| `animeunity` | animeunity.co (scraper) | JP | IT hardsubs (burned in) | session cookies | ~2s |

## API

| Route | Description |
|---|---|
| `GET /api/providers` | List available provider names |
| `GET /api/anilist/search?q=` | AniList search |
| `GET /api/anilist/info?id=` | AniList anime info |
| `GET /api/episodes?anilistId=&title=` | Episode list via provider registry (`?provider=` for specific, `?provider=&slug=` for slug-only lookup) |
| `GET /api/stream?provider=&animeId=&slug=&episodeId=` | Stream URL (HLS/MP4 + subtitles) |
| `GET /api/subtitle?url=&referer=` | Subtitle proxy (SRT→VTT conversion, optional Referer for CDNs that require it) |
| `GET /api/proxy?url=&referer=` | HLS/MP4 proxy (Referer + Range forwarding, m3u8 rewriting) |

## Routes

- `/` — search
- `/anime/{id}` — anime detail + episode list (provider switcher)
- `/watch/{provider}/{anilistId}/{slug}/{episodeId}?aid={providerAnimeId}` — player (provider + episode switcher, subs)

## Adding a provider

Implement `Provider` in `src/providers/<name>.ts`, add to the `providers` array in `src/providers/index.ts`. The episode list and stream API routes pick it up automatically.

Required: `findEpisodes(ref)` + `getStream(req)`. Optional: `findEpisodesBySlug(slug)` — lets the watch page populate the episode dropdown without the AniList title.

Episodes should set `slug` (provider anime slug) + `id` (episode id) + `animeId` (provider's internal anime ID, or 0 if unused).
