<script lang="ts">
  import { getAnime, type AnimeDetail } from "../../../src/anilist";
  import { navigate } from "../lib/router";

  let { id }: { id: number } = $props();

  let anime = $state<AnimeDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    id;
    loading = true;
    error = null;
    getAnime(id)
      .then((a) => (anime = a))
      .catch((e) => (error = e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false));
  });

  function stripHtml(s: string | null) {
    if (!s) return "";
    return s.replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim();
  }
</script>

<main class="wrap">
  <button class="btn-ghost" onclick={() => navigate("/")}>← back</button>

  {#if loading}
    <p class="muted">loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if anime}
    <div class="head">
      <img class="cover" src={anime.coverImage.large} alt={anime.title.romaji} />
      <div class="info">
        <h1>{anime.title.english ?? anime.title.romaji}</h1>
        <p class="romaji">{anime.title.romaji}</p>
        <p class="facts">
          {anime.seasonYear ?? "?"} · {anime.episodes ? `${anime.episodes} eps` : "ongoing"}
        </p>
      </div>
    </div>

    {#if anime.description}
      <section class="desc">
        <h2>Synopsis</h2>
        <p>{stripHtml(anime.description)}</p>
      </section>
    {/if}
  {/if}
</main>