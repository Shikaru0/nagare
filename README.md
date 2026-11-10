# nagare

[![CI](https://github.com/Shikaru0/nagare/actions/workflows/ci.yml/badge.svg)](https://github.com/Shikaru0/nagare/actions/workflows/ci.yml)
[![Release](https://github.com/Shikaru0/nagare/actions/workflows/release.yml/badge.svg)](https://github.com/Shikaru0/nagare/actions/workflows/release.yml)

Self-hosted anime streaming + manga reader. AniList for metadata, in-house scrapers (`src/providers/`, `src/manga-providers/`) for episodes and chapters.

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

## Docker

```bash
docker pull ghcr.io/shikaru0/nagare:latest
docker run -p 4141:4141 ghcr.io/shikaru0/nagare:latest
```

The Release workflow (`.github/workflows/release.yml`) builds and pushes the image to GHCR on every push to `main` (tagged `latest` + commit SHA) and on version tags `v*` (tagged with the version number).

## Stack

- **Runtime**: Bun
- **Frontend**: Svelte 5 (runes) + Vite + Tailwind 4
- **Player**: hls.js (HLS), native `<video>` (MP4 fallback)
- **Reader**: vertical scroll, lazy-loaded `<img>`
- **Lint/format**: Bun built-in (`bun fmt` / `bun lint`)
- **Metadata**: AniList GraphQL API (search, info — anime + manga)
- **Anime providers**: ZokoAnime (`src/providers/zokoanime.ts`), AniZone (`src/providers/anizone.ts`), AnimeUnity (`src/providers/animeunity.ts`)
- **Manga providers**: MangaDex (`src/manga-providers/mangadex.ts`)

## Anime providers

Each provider implements `findEpisodes(ref)` and `getStream(req)`. The registry tries providers in order — first hit wins.

| Provider     | Source                  | Audio | Subs                         | Cloudflare      | Speed |
| ------------ | ----------------------- | ----- | ---------------------------- | --------------- | ----- |
| `zokoanime`  | zokoanime.video (embed) | JP    | EN softsubs (toggleable VTT) | none            | ~2s   |
| `anizone`    | anizone.to (scraper)    | JP    | EN & more (SRT→VTT)          | none            | ~3s   |
| `animeunity` | animeunity.co (scraper) | JP    | IT hardsubs (burned in)      | session cookies | ~2s   |

## Manga providers

Each provider implements `findChapters(ref)` and `getPages(req)`. Same registry pattern as anime — first hit wins.

| Provider   | Source                             | Cloudflare | Notes                                                                                                      |
| ---------- | ---------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `mangadex` | api.mangadex.org (official API v5) | none       | EN chapters, deduped by chapter number, paginated. Page images served directly from CDN (no proxy needed). |

Some manga are split across multiple MangaDex entries without formal sequel relations (e.g. Chainsaw Man Part 1 vs Part 2). The chapter list reflects what's available under the matched entry — chapters from unlinked sequels won't appear automatically.

## API

| Route                                                 | Description                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/providers`                                  | List available anime provider names                                                                           |
| `GET /api/anilist/search?q=`                          | AniList anime search                                                                                          |
| `GET /api/anilist/info?id=`                           | AniList anime info                                                                                            |
| `GET /api/episodes?anilistId=&title=`                 | Episode list via provider registry (`?provider=` for specific, `?provider=&slug=` for slug-only lookup)       |
| `GET /api/stream?provider=&animeId=&slug=&episodeId=` | Stream URL (HLS/MP4 + subtitles)                                                                              |
| `GET /api/subtitle?url=&referer=`                     | Subtitle proxy (SRT→VTT conversion, optional Referer for CDNs that require it)                                |
| `GET /api/proxy?url=&referer=`                        | HLS/MP4 proxy (Referer + Range forwarding, m3u8 rewriting)                                                    |
| `GET /api/manga/providers`                            | List available manga provider names                                                                           |
| `GET /api/manga/search?q=`                            | AniList manga search                                                                                          |
| `GET /api/manga/info?id=`                             | AniList manga info                                                                                            |
| `GET /api/manga/chapters?anilistId=&title=`           | Chapter list via manga provider registry (`?provider=` for specific, `?provider=&slug=` for slug-only lookup) |
| `GET /api/manga/pages?provider=&chapterId=`           | Page image URLs for a chapter                                                                                 |

## Routes

- `/` — search (anime/manga toggle)
- `/anime/{id}` — anime detail + episode list (provider switcher)
- `/watch/{provider}/{anilistId}/{slug}/{episodeId}?aid={providerAnimeId}` — player (provider + episode switcher, subs)
- `/manga/{id}` — manga detail + chapter list (provider switcher)
- `/read/{provider}/{anilistId}/{slug}/{chapterId}` — reader (chapter switcher, vertical scroll)

## Adding a provider

**Anime:** implement `Provider` in `src/providers/<name>.ts`, add to the `providers` array in `src/providers/index.ts`. The episode list and stream API routes pick it up automatically.

Required: `findEpisodes(ref)` + `getStream(req)`. Optional: `findEpisodesBySlug(slug)` — lets the watch page populate the episode dropdown without the AniList title.

Episodes should set `slug` (provider anime slug) + `id` (episode id) + `animeId` (provider's internal anime ID, or 0 if unused).

**Manga:** implement `MangaProvider` in `src/manga-providers/<name>.ts`, add to the `mangaProviders` array in `src/manga-providers/index.ts`. The chapter list and pages API routes pick it up automatically.

Required: `findChapters(ref)` + `getPages(req)`. Optional: `findChaptersBySlug(slug)` — lets the read page populate the chapter dropdown without the AniList title.

Chapters should set `slug` (provider manga slug) + `id` (chapter id) + `mangaId` (provider's internal manga ID, or 0 if unused).
