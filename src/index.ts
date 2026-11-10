const port = Number(process.env.PORT ?? 4141);
const distDir = `${import.meta.dir}/../dist`;

const notFound = () => new Response("not found", { status: 404 });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Convert SRT subtitle format to WebVTT for the browser's <track> element.
// SRT uses commas in timestamps, VTT uses periods; VTT needs WEBVTT header.
function srtToVtt(srt: string): string {
  const vtt = srt
    .replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim();
  return `WEBVTT\n\n${vtt}`;
}

// Rewrite relative URLs in an m3u8 playlist to route through /api/proxy,
// so segment requests also get the right Referer + cookies. Also rewrites
// URI="..." attributes inside tag lines (#EXT-X-MEDIA alt-audio, #EXT-X-KEY
// encryption keys, etc.) — otherwise hls.js resolves them relative to the
// proxied manifest URL and 404s.
function rewriteM3u8(
  text: string,
  base: URL,
  referer: string,
  refererCookies: string,
): string {
  const buildProxyUrl = (rawUrl: string): string => {
    if (rawUrl.startsWith("/api/proxy?")) return rawUrl;
    try {
      const abs = new URL(rawUrl, base).href;
      const cookieParam = refererCookies
        ? `&cookies=${encodeURIComponent(refererCookies)}`
        : "";
      return `/api/proxy?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}${cookieParam}`;
    } catch {
      return rawUrl;
    }
  };
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith("#")) return buildProxyUrl(trimmed);
      if (trimmed.includes('URI="')) {
        return trimmed.replace(
          /URI="([^"]+)"/g,
          (_m, p1) => `URI="${buildProxyUrl(p1)}"`,
        );
      }
      return line;
    })
    .join("\n");
}

import { getAnime, searchAnime } from "./anilist";
import { findEpisodes, getProvider } from "./providers";

Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    // -- API routes --
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/anilist/search") {
        const q = url.searchParams.get("q")?.trim();
        if (!q) return json({ error: "missing ?q=" }, 400);
        try {
          return json(await searchAnime(q));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
      if (url.pathname === "/api/anilist/info") {
        const id = Number(url.searchParams.get("id"));
        if (!id) return json({ error: "missing ?id=" }, 400);
        try {
          return json(await getAnime(id));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
      if (url.pathname === "/api/episodes") {
        const anilistId = Number(url.searchParams.get("anilistId"));
        const title = url.searchParams.get("title")?.trim();
        if (!anilistId || !title) {
          return json({ error: "missing ?anilistId= and ?title=" }, 400);
        }
        const result = await findEpisodes({ anilistId, title });
        return json(result);
      }
      if (url.pathname === "/api/stream") {
        const provider = getProvider(url.searchParams.get("provider") ?? "");
        const animeId = Number(url.searchParams.get("animeId") ?? 0);
        const slug = url.searchParams.get("slug")?.trim();
        const episodeId = url.searchParams.get("episodeId")?.trim();
        if (!provider || !slug || !episodeId) {
          return json({ error: "missing ?provider=&slug=&episodeId=" }, 400);
        }
        try {
          return json(await provider.getStream({ animeId, slug, episodeId }));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
      if (url.pathname === "/api/subtitle") {
        // Fetch a subtitle file (SRT or VTT) and convert to WebVTT for
        // the browser's <track> element. ASS subtitles are skipped —
        // browsers can't render them natively.
        const target = url.searchParams.get("url");
        if (!target) return json({ error: "missing ?url=" }, 400);
        try {
          const res = await fetch(target, {
            headers: {
              "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            },
          });
          if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);
          const text = await res.text();
          const vtt = text.trimStart().startsWith("WEBVTT") ? text : srtToVtt(text);
          return new Response(vtt, {
            headers: {
              "Content-Type": "text/vtt",
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 502);
        }
      }
      if (url.pathname === "/api/proxy") {
        // HLS playlist + segment proxy, also serves MP4 fallback.
        // Forwards Referer + cookies + Range (for MP4 seeking) upstream,
        // rewrites m3u8 URLs to route segments back through here.
        const target = url.searchParams.get("url");
        const referer = url.searchParams.get("referer") ?? "https://vixcloud.cc/";
        const cookies = url.searchParams.get("cookies") ?? "";
        if (!target) return json({ error: "missing ?url=" }, 400);
        try {
          const range = req.headers.get("range");
          const upstream = await fetch(target, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: referer,
              Origin: new URL(referer).origin,
              ...(cookies ? { Cookie: cookies } : {}),
              ...(range ? { Range: range } : {}),
            },
          });
          if (!upstream.ok && upstream.status !== 206) {
            return json({ error: `upstream ${upstream.status}` }, 502);
          }
          const contentType = upstream.headers.get("content-type") ?? "";
          if (contentType.includes("mpegurl") || target.endsWith(".m3u8")) {
            const text = await upstream.text();
            // Reject non-m3u8 bodies (error pages, encrypted blobs, etc.)
            // so hls.js gets a clean 502 instead of choking on garbage.
            if (!text.trimStart().startsWith("#EXTM3U")) {
              return json({ error: `upstream returned non-m3u8 body` }, 502);
            }
            const base = new URL(target);
            const rewritten = rewriteM3u8(text, base, referer, cookies);
            return new Response(rewritten, {
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Cache-Control": "no-store",
              },
            });
          }
          // MP4 / segments: pass through with range headers for seeking
          const respHeaders: Record<string, string> = {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
          };
          const len = upstream.headers.get("content-length");
          if (len) respHeaders["Content-Length"] = len;
          const cr = upstream.headers.get("content-range");
          if (cr) respHeaders["Content-Range"] = cr;
          if (upstream.status === 206) respHeaders["Accept-Ranges"] = "bytes";
          return new Response(upstream.body, {
            status: upstream.status,
            headers: respHeaders,
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 502);
        }
      }
      return notFound();
    }

    // -- static + SPA fallback --
    const path = decodeURIComponent(url.pathname);
    if (path.includes("..")) return notFound();

    const file = Bun.file(path === "/" ? `${distDir}/index.html` : `${distDir}${path}`);
    if (await file.exists()) return new Response(file);

    const index = Bun.file(`${distDir}/index.html`);
    if (await index.exists()) return new Response(index);

    return notFound();
  },
});

if (!(await Bun.file(`${distDir}/index.html`).exists())) {
  console.warn("dist/index.html not found — run `bun run build` first");
}

console.log(`nagare serving dist/ at http://localhost:${port}`);
