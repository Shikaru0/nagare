<script lang="ts">
import Hls from "hls.js";
import { onMount } from "svelte";
import { navigate } from "../lib/router";

let {
  provider,
  animeId,
  slug,
  episodeId,
}: {
  provider: string;
  animeId: number;
  slug: string;
  episodeId: string;
} = $props();

// animeId from the URL is the AniList ID. The provider's internal anime
// ID (e.g. AnimeUnity's record ID) comes from the ?aid= query param —
// needed for providers that use it in their stream extraction.
let providerAnimeId = $state(0);
function readProviderAnimeId() {
  const urlParams = new URLSearchParams(window.location.search);
  providerAnimeId = Number(urlParams.get("aid") ?? 0);
}
readProviderAnimeId();

let videoEl = $state<HTMLVideoElement | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let using = $state<string>("");
let hls: Hls | null = null;

type Sub = { url: string; language: string; label: string; format?: string };
let subtitles = $state<Sub[]>([]);
let activeSub = $state<number>(-1);

// Provider + episode switcher state
// svelte-ignore state_referenced_locally
let providerList = $state<string[]>([provider]);
// svelte-ignore state_referenced_locally
let currentProvider = $state(provider);
let switching = $state(false);
type EpisodeLite = { id: string; number: number; title?: string; animeId?: number };
let episodes = $state<EpisodeLite[]>([]);
// svelte-ignore state_referenced_locally
let currentEpId = $state(episodeId);
let animeTitle = $state<string>("");

onMount(() => {
  // Load provider list + anime title for the switcher dropdowns
  fetch("/api/providers")
    .then((r) => r.json())
    .then((d: { providers: string[] }) => {
      if (d.providers?.length) providerList = d.providers;
    })
    .catch(() => {});
  // Fetch AniList title (for provider switching). If animeId is 0
  // (old links), skip — refreshEpisodes falls back to slug-based lookup.
  if (animeId > 0) {
    fetch(`/api/anilist/info?id=${animeId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`anilist info ${r.status}`);
        return r.json();
      })
      .then((a: { title?: { english?: string; romaji?: string }; error?: string }) => {
        if (a.error) throw new Error(a.error);
        animeTitle = a.title?.english ?? a.title?.romaji ?? "";
      })
      .catch((e) => {
        console.error(`[watch] failed to fetch anime title:`, e);
      })
      .finally(() => {
        refreshEpisodes(currentProvider);
      });
  } else {
    // No AniList ID — use slug-based lookup directly
    refreshEpisodes(currentProvider);
  }

  loadStream(currentProvider, episodeId);

  return () => {
    hls?.destroy();
    hls = null;
  };
});

// Re-run when the URL changes (back/forward, manual edit, navigate()).
// onMount only fires once per component instance, so we need this to
// catch episode/provider changes that don't remount the component.
$effect(() => {
  const _prov = provider;
  const _ep = episodeId;
  if (_prov === currentProvider && _ep === currentEpId) return;
  currentProvider = _prov;
  currentEpId = _ep;
  readProviderAnimeId(); // update providerAnimeId from ?aid= query param
  loadStream(_prov, _ep);
});

function refreshEpisodes(prov: string) {
  // If we have the AniList title, use the title-based search (works for
  // all providers). Otherwise, fall back to slug-based lookup (only
  // works for providers that implement findEpisodesBySlug, e.g. anizone).
  let qs: URLSearchParams;
  if (animeTitle) {
    qs = new URLSearchParams({
      anilistId: String(animeId),
      title: animeTitle,
      provider: prov,
    });
  } else {
    qs = new URLSearchParams({
      provider: prov,
      slug,
    });
  }
  fetch(`/api/episodes?${qs}`)
    .then((r) => r.json())
    .then((d: { episodes: EpisodeLite[] }) => {
      episodes = d.episodes ?? [];
    })
    .catch(() => {});
}

function loadStream(prov: string, epId: string) {
  loading = true;
  error = null;
  using = "";
  subtitles = [];
  activeSub = -1;
  hls?.destroy();
  hls = null;

  const qs = new URLSearchParams({
    provider: prov,
    animeId: String(providerAnimeId),
    slug,
    episodeId: epId,
  });
  fetch(`/api/stream?${qs}`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`stream ${r.status}`);
      return r.json() as Promise<{
        hls?: string;
        mp4?: string;
        referer: string;
        subtitles?: Sub[];
        error?: string;
      }>;
    })
    .then(({ hls: hlsUrl, mp4, referer, subtitles: subs, error: err }) => {
      if (err) throw new Error(err);
      if (!videoEl) return;
      // Filter out ASS subtitles — browsers can't render them natively.
      // SRT is converted to VTT server-side via /api/subtitle.
      subtitles = (subs ?? []).filter((s) => s.format !== "ass");
      if (hlsUrl) {
        const proxied = `/api/proxy?url=${encodeURIComponent(hlsUrl)}&referer=${encodeURIComponent(referer)}`;
        tryHls(proxied, () => {
          if (mp4) tryMp4(mp4);
          else {
            error = "hls load failed, no mp4 fallback";
            loading = false;
          }
        });
      } else if (mp4) {
        tryMp4(mp4);
      } else {
        throw new Error("no stream url");
      }
    })
    .catch((e) => {
      error = e instanceof Error ? e.message : String(e);
      loading = false;
    });
}

function tryHls(url: string, onFail: () => void) {
  if (!videoEl) return;
  if (!Hls.isSupported()) {
    // Safari: native HLS
    if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = url;
      using = "hls (native)";
      loading = false;
      videoEl.play().catch(() => {});
      // Can't easily detect failure for native — assume it works
      return;
    }
    onFail();
    return;
  }
  hls = new Hls({ enableWorker: true });
  hls.loadSource(url);
  hls.attachMedia(videoEl);
  let failed = false;
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    using = "hls";
    loading = false;
    videoEl?.play().catch(() => {});
  });
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (data.fatal && !failed) {
      failed = true;
      hls?.destroy();
      hls = null;
      onFail();
    }
  });
}

function tryMp4(url: string) {
  if (!videoEl) return;
  // MP4 also goes through /api/proxy to bypass CORS (CDN doesn't send
  // Access-Control-Allow-Origin). Range requests work for seeking.
  using = "mp4";
  loading = false;
  videoEl.src = `/api/proxy?url=${encodeURIComponent(url)}`;
  videoEl.play().catch(() => {});
}

function subUrl(url: string): string {
  // Route through /api/subtitle for SRT→VTT conversion
  return `/api/subtitle?url=${encodeURIComponent(url)}`;
}

function toggleSub(idx: number) {
  if (!videoEl) return;
  activeSub = activeSub === idx ? -1 : idx;
  for (let i = 0; i < videoEl.textTracks.length; i++) {
    const track = videoEl.textTracks[i];
    if (track) track.mode = i === idx ? "showing" : "disabled";
  }
}

async function switchProvider(newProvider: string) {
  if (newProvider === currentProvider || switching) return;
  switching = true;
  const epNumber = Number(episodeId);
  try {
    // Need the real anime title for provider episode lookup.
    // Only fetch from AniList if we have a real ID (not 0).
    if (!animeTitle && animeId > 0) {
      const infoRes = await fetch(`/api/anilist/info?id=${animeId}`);
      if (!infoRes.ok) throw new Error(`anilist info ${infoRes.status}`);
      const info = (await infoRes.json()) as {
        title?: { english?: string; romaji?: string };
        error?: string;
      };
      if (info.error) throw new Error(info.error);
      animeTitle = info.title?.english ?? info.title?.romaji ?? "";
    }
    if (!animeTitle) {
      error = "can't switch provider without anime title (need valid AniList ID in URL)";
      switching = false;
      return;
    }
    const qs = new URLSearchParams({
      anilistId: String(animeId),
      title: animeTitle,
      provider: newProvider,
    });
    const r = await fetch(`/api/episodes?${qs}`);
    const d = (await r.json()) as {
      provider: string | null;
      episodes: EpisodeLite[];
      error?: string;
    };
    if (!d.provider || !d.episodes?.length) {
      error = `no episodes from ${newProvider}: ${d.error ?? "none"}`;
      switching = false;
      return;
    }
    episodes = d.episodes;
    const matchingEp = d.episodes.find((e) => e.number === epNumber) ?? d.episodes[0];
    if (!matchingEp) {
      error = `${newProvider} has no episode ${epNumber}`;
      switching = false;
      return;
    }
    // Don't set currentProvider/currentEpId here — the $effect will set
    // them when the props update via navigate(). Setting them now would
    // make the $effect guard bail and loadStream would never fire.
    // Navigate with AniList ID in path + provider's animeId as ?aid=
    navigate(
      `/watch/${newProvider}/${animeId}/${slug}/${matchingEp.id}?aid=${matchingEp.animeId ?? 0}`,
    );
  } catch (e) {
    error = `switch failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    switching = false;
  }
}

function switchEpisode(newEpId: string) {
  if (newEpId === currentEpId) return;
  const ep = episodes.find((e) => e.id === newEpId);
  // Don't set currentEpId here — the $effect will set it when the
  // episodeId prop updates via navigate(). Setting it now would make
  // the $effect guard bail (prop === currentEpId) and loadStream
  // would never fire.
  navigate(
    `/watch/${currentProvider}/${animeId}/${slug}/${newEpId}?aid=${ep?.animeId ?? providerAnimeId}`,
  );
}

// Prev/next work by episode number so they're usable even before the
// full episode list loads from the provider.
function prevEpisode() {
  const epNum = Number(currentEpId);
  if (Number.isNaN(epNum) || epNum <= 1) return;
  const newId = String(epNum - 1);
  switchEpisode(newId);
}
function nextEpisode() {
  const epNum = Number(currentEpId);
  if (Number.isNaN(epNum)) return;
  // If we have the episode list, cap at the last episode
  if (episodes.length > 0) {
    const maxEp = Math.max(...episodes.map((e) => e.number));
    if (epNum >= maxEp) return;
  }
  const newId = String(epNum + 1);
  switchEpisode(newId);
}
</script>

<main class="wrap">
  <button class="btn-ghost" onclick={() => history.back()}>← back</button>

  <div class="switcher-bar">
    <label>
      <span class="switcher-label">provider</span>
      <select value={currentProvider} onchange={(e) => switchProvider(e.currentTarget.value)} disabled={switching}>
        {#each providerList as p (p)}
          <option value={p} selected={p === currentProvider}>{p}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="switcher-label">episode</span>
      <select value={currentEpId} onchange={(e) => switchEpisode(e.currentTarget.value)} disabled={switching}>
        {#if episodes.length === 0}
          <option value={currentEpId}>{currentEpId}</option>
        {:else}
          {#each episodes as ep (ep.id)}
            <option value={ep.id} selected={ep.id === currentEpId}>
              {ep.number}{ep.title ? ` — ${ep.title}` : ""}
            </option>
          {/each}
        {/if}
      </select>
    </label>
    <div class="ep-nav">
      <button class="btn-ghost" onclick={prevEpisode} disabled={switching || Number(currentEpId) <= 1}>← prev</button>
      <button class="btn-ghost" onclick={nextEpisode} disabled={switching}>next →</button>
    </div>
  </div>

  {#if loading}
    <p class="muted">loading stream…</p>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="player">
    <video bind:this={videoEl} controls autoplay playsinline>
      {#each subtitles as s (s.url)}
        <track src={subUrl(s.url)} srclang={s.language} label={s.label} />
      {/each}
    </video>
    {#if using}<p class="muted stream-source">via {using}</p>{/if}
  </div>

  {#if subtitles.length > 0}
    <div class="subs-bar">
      <span class="switcher-label">subs</span>
      <button
        class="btn-ghost"
        onclick={() => toggleSub(-1)}
        style:font-weight={activeSub === -1 ? "bold" : "normal"}
      >off</button>
      {#each subtitles as s, i (s.url)}
        <button
          class="btn-ghost"
          onclick={() => toggleSub(i)}
          style:font-weight={activeSub === i ? "bold" : "normal"}
        >{s.label}</button>
      {/each}
    </div>
  {/if}
</main>