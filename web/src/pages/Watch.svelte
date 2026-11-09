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
        error?: string;
      }>;
    })
    .then(({ hls: hlsUrl, mp4, referer, error: err }) => {
      if (err) throw new Error(err);
      if (!videoEl) return;
      // Try HLS first (multi-quality, switchable subs). Route through
      // /api/proxy so the server sets Referer on the m3u8 + segments.
      if (hlsUrl) {
        const proxied = `/api/proxy?url=${encodeURIComponent(hlsUrl)}&referer=${encodeURIComponent(referer)}`;
        tryHls(proxied, () => {
          // HLS failed (e.g. vixcloud 403) — fall back to MP4 if we have one
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
    <video bind:this={videoEl} controls autoplay playsinline></video>
    {#if using}<p class="muted stream-source">via {using}</p>{/if}
  </div>
</main>