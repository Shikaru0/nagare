<script lang="ts">
import Hls from "hls.js";
import { onMount } from "svelte";

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

let videoEl = $state<HTMLVideoElement | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let using = $state<string>("");
let hls: Hls | null = null;

type Sub = { url: string; language: string; label: string; format?: string };
let subtitles = $state<Sub[]>([]);
let activeSub = $state<number>(-1);

onMount(() => {
  const qs = new URLSearchParams({
    provider,
    animeId: String(animeId),
    slug,
    episodeId,
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

  return () => {
    hls?.destroy();
    hls = null;
  };
});

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
    videoEl.textTracks[i]!.mode = i === idx ? "showing" : "disabled";
  }
}
</script>

<main class="wrap">
  <button class="btn-ghost" onclick={() => history.back()}>← back</button>

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