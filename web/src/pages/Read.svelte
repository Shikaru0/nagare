<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../lib/router";

  let {
    provider,
    mangaId,
    slug,
    chapterId,
  }: {
    provider: string;
    mangaId: number;
    slug: string;
    chapterId: string;
  } = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let pages = $state<string[]>([]);

  // Chapter switcher state
  type ChapterLite = {
    id: string;
    number: number;
    title?: string;
    slug?: string;
  };
  // svelte-ignore state_referenced_locally
  let chapters = $state<ChapterLite[]>([]);
  // svelte-ignore state_referenced_locally
  let currentChapterId = $state(chapterId);
  let mangaTitle = $state<string>("");

  onMount(() => {
    // Fetch AniList title (for chapter list refresh). If mangaId is 0,
    // skip — fall back to slug-based lookup.
    if (mangaId > 0) {
      fetch(`/api/manga/info?id=${mangaId}`)
        .then((r) => {
          if (!r.ok) throw new Error(`manga info ${r.status}`);
          return r.json();
        })
        .then(
          (a: {
            title?: { english?: string; romaji?: string };
            error?: string;
          }) => {
            if (a.error) throw new Error(a.error);
            mangaTitle = a.title?.english ?? a.title?.romaji ?? "";
          },
        )
        .catch((e) => {
          console.error(`[read] failed to fetch manga title:`, e);
        })
        .finally(() => {
          refreshChapters();
        });
    } else {
      refreshChapters();
    }

    loadPages(chapterId);

    return () => {};
  });

  // Re-run when the URL changes (back/forward, manual edit, navigate()).
  $effect(() => {
    const _ch = chapterId;
    if (_ch === currentChapterId) return;
    currentChapterId = _ch;
    loadPages(_ch);
  });

  function refreshChapters() {
    let qs: URLSearchParams;
    if (mangaTitle) {
      qs = new URLSearchParams({
        anilistId: String(mangaId),
        title: mangaTitle,
        provider,
      });
    } else {
      qs = new URLSearchParams({ provider, slug });
    }
    fetch(`/api/manga/chapters?${qs}`)
      .then((r) => r.json())
      .then((d: { chapters: ChapterLite[] }) => {
        chapters = d.chapters ?? [];
      })
      .catch(() => {});
  }

  function loadPages(chId: string) {
    loading = true;
    error = null;
    pages = [];
    // Scroll to top on new chapter
    window.scrollTo({ top: 0 });

    const qs = new URLSearchParams({ provider, chapterId: chId });
    fetch(`/api/manga/pages?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`pages ${r.status}`);
        return r.json() as Promise<{ pages: string[]; error?: string }>;
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        pages = data.pages ?? [];
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        loading = false;
      });
  }

  function switchChapter(newChId: string) {
    if (newChId === currentChapterId) return;
    const ch = chapters.find((c) => c.id === newChId);
    navigate(`/read/${provider}/${mangaId}/${ch?.slug ?? slug}/${newChId}`);
  }

  function prevChapter() {
    const idx = chapters.findIndex((c) => c.id === currentChapterId);
    if (idx > 0) switchChapter(chapters[idx - 1]?.id ?? currentChapterId);
  }
  function nextChapter() {
    const idx = chapters.findIndex((c) => c.id === currentChapterId);
    if (idx >= 0 && idx < chapters.length - 1) {
      switchChapter(chapters[idx + 1]?.id ?? currentChapterId);
    }
  }
</script>

<main class="wrap reader">
  <div class="switcher-bar">
    <button class="btn-ghost" onclick={() => history.back()}>← back</button>
    <label>
      <span class="switcher-label">chapter</span>
      <select
        value={currentChapterId}
        onchange={(e) => switchChapter(e.currentTarget.value)}
      >
        {#if chapters.length === 0}
          <option value={currentChapterId}>{currentChapterId}</option>
        {:else}
          {#each chapters as ch (ch.id)}
            <option value={ch.id} selected={ch.id === currentChapterId}>
              {ch.number}{ch.title ? ` — ${ch.title}` : ""}
            </option>
          {/each}
        {/if}
      </select>
    </label>
    <div class="ep-nav">
      <button class="btn-ghost" onclick={prevChapter} disabled={loading}
        >← prev</button
      >
      <button class="btn-ghost" onclick={nextChapter} disabled={loading}
        >next →</button
      >
    </div>
  </div>

  {#if loading}
    <p class="muted">loading pages…</p>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if pages.length > 0}
    <div class="page-column">
      {#each pages as src, i (src)}
        <img {src} alt={`page ${i + 1}`} loading="lazy" />
      {/each}
    </div>
  {/if}
</main>
