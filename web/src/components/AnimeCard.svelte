<script lang="ts">
import type { AnimeSummary } from "../../../src/anilist";
import { navigate } from "../lib/router";

let { anime }: { anime: AnimeSummary } = $props();

function click(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(`/anime/${anime.id}`);
}
</script>

<a class="card" href={`/anime/${anime.id}`} onclick={click}>
  <img src={anime.coverImage.large} alt={anime.title.romaji} loading="lazy" />
  <h3>{anime.title.english ?? anime.title.romaji}</h3>
  <p>{anime.seasonYear ?? ""}</p>
</a>