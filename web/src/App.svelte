<script lang="ts">
  type Anime = {
    id: number;
    title: { romaji: string; english: string | null };
    coverImage: { large: string };
    seasonYear: number | null;
  };

  let query = $state("");
  let results = $state<Anime[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/anilist/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const body = await res.text();
        let msg = `${res.status} ${res.statusText}`.trim();
        try {
          msg = JSON.parse(body).error ?? msg;
        } catch {
          // body wasn't JSON; keep the status text
        }
        throw new Error(msg);
      }
      results = await res.json();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }
</script>

<main>
  <h1>nagare</h1>
  <p>site</p>
  <form onsubmit={(e) => { e.preventDefault(); search(); }}>
    <input type="search" placeholder="Search anime…" bind:value={query} />
    <button disabled={loading}>{loading ? "…" : "Search"}</button>
  </form>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="grid">
    {#each results as anime (anime.id)}
      <article>
        <img src={anime.coverImage.large} alt={anime.title.romaji} loading="lazy" />
        <h3>{anime.title.english ?? anime.title.romaji}</h3>
        <p>{anime.seasonYear ?? ""}</p>
      </article>
    {/each}
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0e0e12;
    color: #e8e8ee;
    font-family: system-ui, sans-serif;
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 4rem 1rem;
  }
  h1 {
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  form {
    display: flex;
    gap: 0.5rem;
    margin: 1.5rem 0;
  }
  input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    border: 1px solid #2c2c38;
    background: #17171d;
    color: inherit;
    font-size: 1rem;
  }
  button {
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    border: none;
    background: #6c5ce7;
    color: white;
    font-size: 1rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .error {
    color: #ff7675;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
  article img {
    width: 100%;
    border-radius: 8px;
    aspect-ratio: 2 / 3;
    object-fit: cover;
  }
  article h3 {
    font-size: 0.9rem;
    margin: 0.4rem 0 0.1rem;
  }
  article p {
    margin: 0;
    font-size: 0.75rem;
    color: #8888a0;
  }
</style>
