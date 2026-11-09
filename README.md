# nagare

Self-hosted anime streaming. AniList for metadata, in-house AnimeUnity scraper for episodes.

## Dev

```bash
bun install
bun run dev   # api on :4141, vite on :5173
```

## Stack

- Bun + Svelte 5 + Vite + Tailwind 4
- Biome for lint/format
- AniList GraphQL (search, info)
- AnimeUnity scraper (`src/providers/animeunity.ts`)

## API

| Route | Description |
|---|---|
| `GET /api/anilist/search?q=` | AniList search |
| `GET /api/anilist/info?id=` | AniList anime info |
| `GET /api/episodes?anilistId=&title=` | Episode list via provider registry |

## Adding a provider

Implement `Provider` in `src/providers/<name>.ts`, add to the `providers` array in `src/providers/index.ts`. Route + frontend don't change.
