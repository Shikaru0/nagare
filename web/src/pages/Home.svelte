<script lang="ts">
import { type AnimeSummary, searchAnime } from "../../../src/anilist";
import AnimeCard from "../components/AnimeCard.svelte";

let query = $state("");
let results = $state<AnimeSummary[]>([]);
let loading = $state(false);
let error = $state<string | null>(null);

async function search() {
  if (!query.trim()) return;
  loading = true;
  error = null;
  try {
    results = await searchAnime(query);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
  }
}
</script>

<main class="wrap">
  <h1>nagare</h1>
  <p class="muted">anime</p>

  <form class="form" onsubmit={(e) => { e.preventDefault(); search(); }}>
    <input class="input" type="search" placeholder="Search anime…" bind:value={query} />
    <button class="btn" disabled={loading}>{loading ? "…" : "Search"}</button>
  </form>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="grid">
    {#each results as anime (anime.id)}
      <AnimeCard {anime} />
    {/each}
  </div>
</main>