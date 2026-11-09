<script lang="ts">
import { type AnimeDetail, getAnime } from "../../../src/anilist";
import { navigate } from "../lib/router";

type Episode = {
  id: string;
  number: number;
  title?: string;
  isFiller?: boolean;
};

let { id }: { id: number } = $props();

let anime = $state<AnimeDetail | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);

let episodes = $state<Episode[]>([]);
let provider = $state<string | null>(null);
let epsLoading = $state(false);
let epsError = $state<string | null>(null);

// Fetch AniList info, then episodes via provider registry (needs the AniList
// ID + the title — providers can match by either)
$effect(() => {
  id;
  loading = true;
  error = null;
  getAnime(id)
    .then((a) => {
      anime = a;
      const title = a.title.english ?? a.title.romaji;
      epsLoading = true;
      const qs = new URLSearchParams({ anilistId: String(id), title });
      return fetch(`/api/episodes?${qs}`)
        .then((r) => r.json())
        .then((d: { provider: string | null; episodes: Episode[]; error?: string }) => {
          episodes = d.episodes ?? [];
          provider = d.provider;
          epsError = d.error ?? null;
        })
        .catch((e) => {
          epsError = e instanceof Error ? e.message : String(e);
        })
        .finally(() => (epsLoading = false));
    })
    .catch((e) => (error = e instanceof Error ? e.message : String(e)))
    .finally(() => (loading = false));
});

function stripHtml(s: string | null) {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\n/g, " ")
    .trim();
}
</script>

<main class="wrap">
  <button class="btn-ghost" onclick={() => navigate("/")}>← back</button>

  {#if loading}
    <p class="muted">loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if anime}
    <div class="head">
      <img class="cover" src={anime.coverImage.large} alt={anime.title.romaji} />
      <div class="info">
        <h1>{anime.title.english ?? anime.title.romaji}</h1>
        <p class="romaji">{anime.title.romaji}</p>
        <p class="facts">
          {anime.seasonYear ?? "?"} · {anime.episodes ? `${anime.episodes} eps` : "ongoing"}
        </p>
      </div>
    </div>

    {#if anime.description}
      <section class="desc">
        <h2>Synopsis</h2>
        <p>{stripHtml(anime.description)}</p>
      </section>
    {/if}

    <section class="episodes">
      <h2>
        Episodes
        {#if provider}<span class="ep-provider">via {provider}</span>{/if}
      </h2>

      {#if epsLoading}
        <p class="muted">looking up streams…</p>
      {:else if episodes.length === 0}
        <p class="muted">
          {epsError ? `no streams found (${epsError})` : "no streams found for this title."}
        </p>
      {:else}
        <div class="episode-grid">
          {#each episodes as ep (ep.id)}
            <a
              class="episode"
              href={`/watch/${ep.id}`}
              title={ep.title ?? `Episode ${ep.number}`}
            >
              <span class="ep-num">{ep.number}</span>
              <span class="ep-title">{ep.title ?? ""}</span>
              {#if ep.isFiller}<span class="ep-filler">filler</span>{/if}
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>