<script lang="ts">
import { matchRoute, path } from "./lib/router";
import AnimeDetail from "./pages/AnimeDetail.svelte";
import Home from "./pages/Home.svelte";

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