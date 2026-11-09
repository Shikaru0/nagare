<script lang="ts">
import { matchRoute, path } from "./lib/router";
import AnimeDetail from "./pages/AnimeDetail.svelte";
import Home from "./pages/Home.svelte";
import Watch from "./pages/Watch.svelte";

let route = $derived(matchRoute($path));
</script>

{#if route.name === "anime"}
  <AnimeDetail id={route.id} />
{:else if route.name === "watch"}
  <Watch
    provider={route.provider}
    animeId={route.animeId}
    slug={route.slug}
    episodeId={route.episodeId}
  />
{:else if route.name === "home"}
  <Home />
{:else}
  <main class="wrap notfound">
    <h1>404</h1>
    <p class="muted">nothing here.</p>
  </main>
{/if}