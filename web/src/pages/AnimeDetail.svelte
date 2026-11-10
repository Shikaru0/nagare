<script lang="ts">
  import { type AnimeDetail, getAnime } from "../../../src/anilist";
  import { navigate } from "../lib/router";
  import {
    getAnimeProgress,
    isEpisodeWatched,
    updateAnimeProgress,
    animeProgress,
  } from "../lib/progress";

  type Episode = {
    id: string;
    number: number;
    title?: string;
    isFiller?: boolean;
    animeId?: number;
    slug?: string;
  };

  let { id }: { id: number } = $props();

  let anime = $state<AnimeDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let episodes = $state<Episode[]>([]);
  let provider = $state<string | null>(null);
  let epsLoading = $state(false);
  let epsError = $state<string | null>(null);

  // Subscribe to the watched set so the "watched" badge re-renders live.
  let watched = $state<Record<string, boolean>>({});
  animeProgress.subscribe((s) => {
    watched = { ...s.watched };
  });

  // Provider switcher state
  let providerList = $state<string[]>([]);
  // "auto" = iterate all providers; specific name = fetch from that one only
  let currentProvider = $state<string>("auto");

  // Fetch AniList info, then episodes via provider registry (needs the AniList
  // ID + the title — providers can match by either)
  $effect(() => {
    id;
    loading = true;
    error = null;
    getAnime(id)
      .then((a) => {
        anime = a;
        backfillCover();
        fetchEpisodes();
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false));
  });

  // Load provider list for the switcher
  fetch("/api/providers")
    .then((r) => r.json())
    .then((d: { providers: string[] }) => {
      providerList = ["auto", ...d.providers];
    })
    .catch(() => {});

  function fetchEpisodes() {
    if (!anime) return;
    const title = anime.title.english ?? anime.title.romaji;
    epsLoading = true;
    epsError = null;
    const qs = new URLSearchParams({ anilistId: String(id), title });
    if (currentProvider !== "auto") qs.set("provider", currentProvider);
    fetch(`/api/episodes?${qs}`)
      .then((r) => r.json())
      .then(
        (d: {
          provider: string | null;
          episodes: Episode[];
          error?: string;
        }) => {
          episodes = d.episodes ?? [];
          provider = d.provider;
          epsError = d.error ?? null;
        },
      )
      .catch((e) => {
        epsError = e instanceof Error ? e.message : String(e);
      })
      .finally(() => (epsLoading = false));
  }

  function switchProvider(newProvider: string) {
    if (newProvider === currentProvider) return;
    currentProvider = newProvider;
    fetchEpisodes();
  }

  function stripHtml(s: string | null) {
    if (!s) return "";
    return s
      .replace(/<[^>]+>/g, "")
      .replace(/\n/g, " ")
      .trim();
  }

  // Backfill the cover URL on any existing progress record for this anime
  // so the home-page continue rail has a thumbnail. Called once the AniList
  // info loads. This is the only place we have the cover URL; the watch
  // page records positions but doesn't fetch AniList cover art.
  function backfillCover() {
    if (!anime) return;
    const saved = getAnimeProgress(id);
    if (saved && saved.cover !== anime.coverImage.large) {
      updateAnimeProgress({ ...saved, cover: anime.coverImage.large });
    }
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
      <img
        class="cover"
        src={anime.coverImage.large}
        alt={anime.title.romaji}
      />
      <div class="info">
        <h1>{anime.title.english ?? anime.title.romaji}</h1>
        <p class="romaji">{anime.title.romaji}</p>
        <p class="facts">
          {anime.seasonYear ?? "?"} · {anime.episodes
            ? `${anime.episodes} eps`
            : "ongoing"}
        </p>
      </div>
    </div>

    {#if anime.description}
      <section class="desc">
        <h2>Synopsis</h2>
        <p>{stripHtml(anime.description)}</p>
      </section>
    {/if}

    {#if getAnimeProgress(id) && episodes.length > 0}
      {@const saved = getAnimeProgress(id)!}
      {@const resumeEp =
        episodes.find((e) => e.id === saved.episodeId) ??
        episodes.find((e) => e.number === saved.episodeNumber)}
      {#if resumeEp}
        <a
          class="continue-banner"
          href={`/watch/${saved.provider}/${id}/${resumeEp.slug ?? ""}/${resumeEp.id}?aid=${resumeEp.animeId ?? 0}`}
          title="resume where you left off"
        >
          continue from ep {resumeEp.number}
        </a>
      {/if}
    {/if}

    <section class="episodes">
      <div class="episodes-head">
        <h2>
          Episodes
          {#if provider}<span class="ep-provider">via {provider}</span>{/if}
        </h2>
        <div class="switcher-bar">
          {#each providerList as p (p)}
            <button
              class="btn-ghost"
              onclick={() => switchProvider(p)}
              style:font-weight={currentProvider === p ? "bold" : "normal"}
              disabled={epsLoading}>{p}</button
            >
          {/each}
        </div>
      </div>

      {#if epsLoading}
        <p class="muted">looking up streams…</p>
      {:else if episodes.length === 0}
        <p class="muted">
          {epsError
            ? `no streams found (${epsError})`
            : "no streams found for this title."}
        </p>
      {:else}
        <div class="episode-grid">
          {#each episodes as ep (ep.id)}
            <a
              class="episode"
              href={ep.slug
                ? `/watch/${provider}/${id}/${ep.slug}/${ep.id}?aid=${ep.animeId ?? 0}`
                : `/watch/${ep.id}`}
              title={ep.title ?? `Episode ${ep.number}`}
            >
              <span class="ep-num">{ep.number}</span>
              <span class="ep-title">{ep.title ?? ""}</span>
              {#if ep.isFiller}<span class="ep-filler">filler</span>{/if}
              {#if watched[`${id}:${ep.number}`]}
                <span class="ep-watched" title="watched">✓</span>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>
