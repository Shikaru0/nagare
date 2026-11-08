const port = Number(process.env.PORT ?? 4000);
const distDir = `${import.meta.dir}/../dist`;

const notFound = () => new Response("not found", { status: 404 });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

import { searchAnime, getAnime } from "./anilist";

Bun.serve({
  port,
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
      return notFound();
    }

    // -- static + SPA fallback --
    const path = decodeURIComponent(url.pathname);
    if (path.includes("..")) return notFound();

    // try the actual file first
    const file = Bun.file(path === "/" ? `${distDir}/index.html` : `${distDir}${path}`);
    if (await file.exists()) return new Response(file);

    // anything else (e.g. /anime/123) → SPA index.html, let the client router handle it
    const index = Bun.file(`${distDir}/index.html`);
    if (await index.exists()) return new Response(index);

    return notFound();
  },
});

if (!(await Bun.file(`${distDir}/index.html`).exists())) {
  console.warn("dist/index.html not found — run `bun run build` first");
}

console.log(`nagare serving dist/ at http://localhost:${port}`);