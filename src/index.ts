const port = Number(process.env.PORT ?? 4000);
const distDir = `${import.meta.dir}/../dist`;

const notFound = () => new Response("not found", { status: 404 });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function searchAnime(q: string) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query($search: String) {
          Page(perPage: 12) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
              id
              title { romaji english }
              coverImage { large }
              seasonYear
            }
          }
        }`,
      variables: { search: q },
    }),
  });
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data.Page.media;
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/anilist/search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return json({ error: "missing ?q=" }, 400);
      try {
        return json(await searchAnime(q));
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }

    const path = decodeURIComponent(url.pathname);
    if (path.includes("..")) return notFound();

    const file = Bun.file(path === "/" ? `${distDir}/index.html` : `${distDir}${path}`);
    if (await file.exists()) return new Response(file);
    return notFound();
  },
});

if (!(await Bun.file(`${distDir}/index.html`).exists())) {
  console.warn("dist/index.html not found — run `bun run build` first");
}

console.log(`nagare serving dist/ at http://localhost:${port}`);
