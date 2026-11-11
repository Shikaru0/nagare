<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../lib/router";
  import {
    getMangaProgress,
    markChapterRead,
    updateMangaProgress,
  } from "../lib/progress";

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

  // Reader mode: "strip" = vertical scroll, "page" = one page at a time
  // with arrow keys / buttons. Persisted in localStorage.
  type ReaderMode = "strip" | "page";
  let readerMode = $state<ReaderMode>(
    typeof localStorage !== "undefined" &&
      localStorage.getItem("nagare:reader:mode") === "page"
      ? "page"
      : "strip",
  );
  let pageIndex = $state(0);

  // Progress recording: debounced scroll listener writes scrollPct to
  // localStorage. Restore happens after pages have loaded (and the
  // browser has laid them out), so the scroll target exists.
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRestorePct = 0; // saved scrollPct for the current chapter

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

    // Debounced scroll listener — record position into the progress store.
    // We use document scroll because the reader page itself is the scroll
    // container (no inner overflow element).
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(recordProgress, 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Arrow keys page through in page mode.
    const onKey = (e: KeyboardEvent) => {
      if (readerMode !== "page") return;
      if (e.key === "ArrowLeft") prevPage();
      else if (e.key === "ArrowRight") nextPage();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      // Best-effort final flush before unmount.
      recordProgress();
      if (scrollTimer) clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
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

    // Capture saved scrollPct for this chapter so we can restore once the
    // images load — restore in onScrollRestore() after the page renders.
    const saved = getMangaProgress(mangaId);
    pendingRestorePct = saved && saved.chapterId === chId ? saved.scrollPct : 0;

    // Scroll to top first; restore to saved position after layout settles.
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
        if (readerMode === "page") {
          // Restore the page index from the saved scroll percentage.
          pageIndex = Math.min(
            Math.max(Math.ceil(pendingRestorePct * pages.length) - 1, 0),
            Math.max(pages.length - 1, 0),
          );
          pendingRestorePct = 0;
        } else {
          // Defer restore until after the DOM has the <img> elements laid out.
          setTimeout(restoreScroll, 100);
        }
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        loading = false;
      });
  }

  // Restore the saved scroll position for this chapter. The page is
  // scroll-rooted; we compute target from document height.
  function restoreScroll() {
    if (pendingRestorePct <= 0) return;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    // Clamp to [0, 1] in case the saved value is from a taller render.
    const pct = Math.min(Math.max(pendingRestorePct, 0), 1);
    window.scrollTo({ top: Math.round(docHeight * pct) });
    pendingRestorePct = 0;
  }

  function recordProgress() {
    if (readerMode === "page") return; // strip-mode scroll metric only
    const ch = chapters.find((c) => c.id === currentChapterId);
    if (!ch || !mangaTitle) return;
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return; // not enough content to record
    const pct = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
    updateMangaProgress({
      anilistId: mangaId,
      title: mangaTitle,
      cover: "", // backfilled by MangaDetail
      provider,
      chapterId: currentChapterId,
      chapterNumber: ch.number,
      scrollPct: pct,
      updatedAt: Date.now(),
    });
    // Mark read when the user has scrolled to within 5% of the end.
    if (pct >= 0.95) {
      markChapterRead(mangaId, ch.number);
    }
  }

  function switchChapter(newChId: string) {
    if (newChId === currentChapterId) return;
    const ch = chapters.find((c) => c.id === newChId);
    navigate(`/read/${provider}/${mangaId}/${ch?.slug ?? slug}/${newChId}`);
  }

  function prevPage() {
    if (pageIndex > 0) pageIndex--;
  }

  function nextPage() {
    if (pageIndex < pages.length - 1) pageIndex++;
    else nextChapter(); // last page → continue into the next chapter
  }

  function setMode(m: ReaderMode) {
    if (m === readerMode) return;
    readerMode = m;
    pageIndex = 0;
    try {
      localStorage.setItem("nagare:reader:mode", m);
    } catch {}
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
    <div class="mode-toggle">
      <button
        class="btn-ghost"
        class:active={readerMode === "strip"}
        onclick={() => setMode("strip")}>strip</button
      >
      <button
        class="btn-ghost"
        class:active={readerMode === "page"}
        onclick={() => setMode("page")}>paged</button
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
    {#if readerMode === "page"}
      <div class="page-view">
        <img src={pages[pageIndex]} alt={`page ${pageIndex + 1}`} />
        <div class="page-nav">
          <button
            class="btn-ghost"
            onclick={prevPage}
            disabled={pageIndex === 0}>←</button
          >
          <span class="muted">{pageIndex + 1} / {pages.length}</span>
          <button class="btn-ghost" onclick={nextPage}>→</button>
        </div>
      </div>
    {:else}
      <div class="page-column">
        {#each pages as src, i (src)}
          <img {src} alt={`page ${i + 1}`} loading="lazy" />
        {/each}
      </div>
    {/if}
  {/if}
</main>
