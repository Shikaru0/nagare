<script lang="ts">
  import {
    type AnimeSummary,
    type MangaSummary,
    searchAnime,
    searchManga,
  } from "../../../src/anilist";
  import AnimeCard from "../components/AnimeCard.svelte";
  import { navigate } from "../lib/router";

  type Result = (AnimeSummary | MangaSummary) & { _kind: "anime" | "manga" };

  let mode = $state<"anime" | "manga">("anime");
  let query = $state("");
  let results = $state<Result[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

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
</script>

<main class="wrap">
  <h1>nagare</h1>

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
