# nagare

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
- **Lint/format**: Biome
- **Metadata**: AniList GraphQL API (search, info)
- **Providers**: AniZone scraper (`src/providers/anizone.ts`), AnimeUnity fallback (`src/providers/animeunity.ts`)

## Providers

Each provider implements `findEpisodes(ref)` and `getStream(req)`. The registry tries providers in order — first hit wins.

| Provider | Source | Audio | Subs | Speed |
|---|---|---|---|---|
| `anizone` | anizone.to (scraper) | JP | EN & more (SRT→VTT) | ~3s |
| `animeunity` | animeunity.co (scraper) | JP | IT hardsubs | ~2s |

## API

| Route | Description |
|---|---|
| `GET /api/anilist/search?q=` | AniList search |
| `GET /api/anilist/info?id=` | AniList anime info |
| `GET /api/episodes?anilistId=&title=` | Episode list via provider registry |
| `GET /api/stream?provider=&slug=&episodeId=` | Stream URL (HLS/MP4 + subtitles) |
| `GET /api/subtitle?url=` | Subtitle proxy (SRT→VTT conversion) |
| `GET /api/proxy?url=&referer=` | HLS/MP4 proxy (Referer + Range forwarding, m3u8 rewriting) |

## Routes

- `/` — search
- `/anime/{id}` — anime detail + episode list
- `/watch/{provider}/{animeId}/{slug}/{episodeId}` — player

## Adding a provider

Implement `Provider` in `src/providers/<name>.ts`, add to the `providers` array in `src/providers/index.ts`. The episode list and stream API routes pick it up automatically — the frontend works as long as episodes set `slug` + `id` correctly for the watch URL.
