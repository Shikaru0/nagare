<script lang="ts">
  import {
    type AnimeSummary,
    type MangaSummary,
    searchAnime,
    searchManga,
  } from "../../../src/anilist";
  import AnimeCard from "../components/AnimeCard.svelte";
  import { navigate } from "../lib/router";
  import {
    continueAnime,
    continueManga,
    type AnimeProgress,
    type MangaProgress,
  } from "../lib/progress";

  type Result = (AnimeSummary | MangaSummary) & { _kind: "anime" | "manga" };

  let mode = $state<"anime" | "manga">("anime");
  let query = $state("");
  let results = $state<Result[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Continue rails — populated once on mount from localStorage.
  let animeRail = $state<AnimeProgress[]>([]);
  let mangaRail = $state<MangaProgress[]>([]);
  $effect(() => {
    animeRail = continueAnime();
    mangaRail = continueManga();
  });

  async function search() {
    if (!query.trim()) return;
    loading = true;
    error = null;
    try {
      const items =
        mode === "anime" ? await searchAnime(query) : await searchManga(query);
      results = items.map((m) => ({ ...m, _kind: mode }));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function clickResult(e: MouseEvent, item: Result) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`/${item._kind}/${item.id}`);
  }

  // Click on a continue-rail entry → resume straight into the watch/read page.
  function clickContinueAnime(e: MouseEvent, p: AnimeProgress) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`/anime/${p.anilistId}`);
  }
  function clickContinueManga(e: MouseEvent, p: MangaProgress) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`/manga/${p.anilistId}`);
  }

  function fmtSecs(s: number): string {
    if (!s || Number.isNaN(s)) return "";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  }
</script>

<main class="wrap">
  <h1>nagare</h1>

  {#if animeRail.length > 0}
    <section class="rail-section">
      <h2>continue watching</h2>
      <div class="rail">
        {#each animeRail as p (p.anilistId)}
          <a
            class="rail-card"
            href={`/anime/${p.anilistId}`}
            onclick={(e) => clickContinueAnime(e, p)}
          >
            <img src={p.cover} alt={p.title} loading="lazy" />
            <div class="rail-meta">
              <h3>{p.title}</h3>
              <p class="muted">
                ep {p.episodeNumber}{p.positionSec > 0
                  ? ` · ${fmtSecs(p.positionSec)}`
                  : ""}
              </p>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if mangaRail.length > 0}
    <section class="rail-section">
      <h2>continue reading</h2>
      <div class="rail">
        {#each mangaRail as p (p.anilistId)}
          <a
            class="rail-card"
            href={`/manga/${p.anilistId}`}
            onclick={(e) => clickContinueManga(e, p)}
          >
            <img src={p.cover} alt={p.title} loading="lazy" />
            <div class="rail-meta">
              <h3>{p.title}</h3>
              <p class="muted">ch {p.chapterNumber}</p>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <div class="mode-toggle">
    <button
      class="btn-ghost"
      class:active={mode === "anime"}
      onclick={() => (mode = "anime")}>anime</button
    >
    <button
      class="btn-ghost"
      class:active={mode === "manga"}
      onclick={() => (mode = "manga")}>manga</button
    >
  </div>

  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      search();
    }}
  >
    <input
      class="input"
      type="search"
      placeholder="Search {mode}…"
      bind:value={query}
    />
    <button class="btn" disabled={loading}>{loading ? "…" : "Search"}</button>
  </form>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="grid">
    {#each results as item (item.id)}
      {#if item._kind === "anime"}
        <AnimeCard anime={item as AnimeSummary} />
      {:else}
        <a
          class="card"
          href={`/manga/${item.id}`}
          onclick={(e) => clickResult(e, item)}
        >
          <img
            src={item.coverImage.large}
            alt={item.title.romaji}
            loading="lazy"
          />
          <h3>{item.title.english ?? item.title.romaji}</h3>
          <p>{item.seasonYear ?? ""}</p>
        </a>
      {/if}
    {/each}
  </div>
</main>
