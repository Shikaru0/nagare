const port = Number(process.env.PORT ?? 4000);
const distDir = `${import.meta.dir}/../dist`;

const notFound = () => new Response("not found", { status: 404 });

Bun.serve({
  port,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
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
