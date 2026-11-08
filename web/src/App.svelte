<script lang="ts">
  import { path, matchRoute } from "./lib/router";
  import Home from "./pages/Home.svelte";
  import AnimeDetail from "./pages/AnimeDetail.svelte";

  let route = $derived(matchRoute($path));
</script>

{#if route.name === "anime"}
  <AnimeDetail id={route.id} />
{:else if route.name === "home"}
  <Home />
{:else}
  <main class="wrap notfound">
    <h1>404</h1>
    <p class="muted">nothing here.</p>
  </main>
{/if}