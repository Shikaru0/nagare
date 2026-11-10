<script lang="ts">
  import { type MangaDetail, getManga } from "../../../src/anilist";
  import { navigate } from "../lib/router";
  import {
    getMangaProgress,
    updateMangaProgress,
    mangaProgress,
  } from "../lib/progress";

  type Chapter = {
    id: string;
    number: number;
    title?: string;
    pages: number;
    language: string;
    mangaId?: number;
    slug?: string;
  };

  let { id }: { id: number } = $props();

  let manga = $state<MangaDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let chapters = $state<Chapter[]>([]);
  let provider = $state<string | null>(null);
  let chLoading = $state(false);
  let chError = $state<string | null>(null);

  // Live-updating read set for the chapter badges.
  let read = $state<Record<string, boolean>>({});
  mangaProgress.subscribe((s) => {
    read = { ...s.read };
  });

  // Provider switcher state (same as AnimeDetail)
  let providerList = $state<string[]>([]);
  let currentProvider = $state<string>("auto");

  // Fetch AniList manga info, then chapters via provider registry
  $effect(() => {
    id;
    loading = true;
    error = null;
    getManga(id)
      .then((m) => {
        manga = m;
        backfillCover();
        fetchChapters();
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false));
  });

  // Load manga provider list for the switcher
  fetch("/api/manga/providers")
    .then((r) => r.json())
    .then((d: { providers: string[] }) => {
      providerList = ["auto", ...d.providers];
    })
    .catch(() => {});

  function fetchChapters() {
    if (!manga) return;
    const title = manga.title.english ?? manga.title.romaji;
    chLoading = true;
    chError = null;
    const qs = new URLSearchParams({ anilistId: String(id), title });
    if (currentProvider !== "auto") qs.set("provider", currentProvider);
    fetch(`/api/manga/chapters?${qs}`)
      .then((r) => r.json())
      .then(
        (d: {
          provider: string | null;
          chapters: Chapter[];
          error?: string;
        }) => {
          chapters = d.chapters ?? [];
          provider = d.provider;
          chError = d.error ?? null;
        },
      )
      .catch((e) => {
        chError = e instanceof Error ? e.message : String(e);
      })
      .finally(() => (chLoading = false));
  }

  function switchProvider(newProvider: string) {
    if (newProvider === currentProvider) return;
    currentProvider = newProvider;
    fetchChapters();
  }

  function stripHtml(s: string | null) {
    if (!s) return "";
    return s
      .replace(/<[^>]+>/g, "")
      .replace(/\n/g, " ")
      .trim();
  }

  // Backfill the cover URL on the existing progress record (mirrors
  // AnimeDetail.backfillCover — see that file for rationale).
  function backfillCover() {
    if (!manga) return;
    const saved = getMangaProgress(id);
    if (saved && saved.cover !== manga.coverImage.large) {
      updateMangaProgress({ ...saved, cover: manga.coverImage.large });
    }
  }
</script>

<main class="wrap">
  <button class="btn-ghost" onclick={() => navigate("/")}>← back</button>

  {#if loading}
    <p class="muted">loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if manga}
    <div class="head">
      <img
        class="cover"
        src={manga.coverImage.large}
        alt={manga.title.romaji}
      />
      <div class="info">
        <h1>{manga.title.english ?? manga.title.romaji}</h1>
        <p class="romaji">{manga.title.romaji}</p>
        <p class="facts">
          {manga.seasonYear ?? "?"} · {manga.chapters
            ? `${manga.chapters} ch`
            : "ongoing"}
        </p>
      </div>
    </div>

    {#if manga.description}
      <section class="desc">
        <h2>Synopsis</h2>
        <p>{stripHtml(manga.description)}</p>
      </section>
    {/if}

    {#if getMangaProgress(id) && chapters.length > 0}
      {@const saved = getMangaProgress(id)!}
      {@const resumeCh =
        chapters.find((c) => c.id === saved.chapterId) ??
        chapters.find((c) => c.number === saved.chapterNumber)}
      {#if resumeCh}
        <a
          class="continue-banner"
          href={`/read/${saved.provider}/${id}/${resumeCh.slug ?? ""}/${resumeCh.id}`}
          title="resume where you left off"
        >
          continue from ch {resumeCh.number}
        </a>
      {/if}
    {/if}

    <section class="episodes">
      <div class="episodes-head">
        <h2>
          Chapters
          {#if provider}<span class="ep-provider">via {provider}</span>{/if}
        </h2>
        <div class="switcher-bar">
          {#each providerList as p (p)}
            <button
              class="btn-ghost"
              onclick={() => switchProvider(p)}
              style:font-weight={currentProvider === p ? "bold" : "normal"}
              disabled={chLoading}>{p}</button
            >
          {/each}
        </div>
      </div>

      {#if chLoading}
        <p class="muted">looking up chapters…</p>
      {:else if chapters.length === 0}
        <p class="muted">
          {chError
            ? `no chapters found (${chError})`
            : "no chapters found for this title."}
        </p>
      {:else}
        <div class="episode-grid">
          {#each chapters as ch (ch.id)}
            <a
              class="episode"
              href={ch.slug
                ? `/read/${provider}/${id}/${ch.slug}/${ch.id}`
                : `/read/${ch.id}`}
              title={ch.title ?? `Chapter ${ch.number}`}
            >
              <span class="ep-num">{ch.number}</span>
              <span class="ep-title">{ch.title ?? ""}</span>
              {#if read[`${id}:${ch.number}`]}
                <span class="ep-watched" title="read">✓</span>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>
