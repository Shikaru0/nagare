// Path is reactive via Svelte store; navigate() pushes state and updates it.
import { writable } from "svelte/store";

export const path = writable(
  typeof window !== "undefined" ? window.location.pathname : "/",
);

export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, "", to);
  path.set(to);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => path.set(window.location.pathname));
}

export type Route =
  | { name: "home" }
  | { name: "anime"; id: number }
  | { name: "watch"; provider: string; animeId: number; slug: string; episodeId: string }
  | { name: "notfound" };

export function matchRoute(p: string): Route {
  const watch = p.match(/^\/watch\/([^/]+)\/(\d+)\/([^/]+)\/([^/]+)$/);
  if (watch?.[1] && watch[2] && watch[3] && watch[4]) {
    return {
      name: "watch",
      provider: decodeURIComponent(watch[1]),
      animeId: Number(watch[2]),
      slug: decodeURIComponent(watch[3]),
      episodeId: decodeURIComponent(watch[4]),
    };
  }
  const m = p.match(/^\/anime\/(\d+)$/);
  if (m?.[1]) return { name: "anime", id: Number(m[1]) };
  if (p === "/" || p === "") return { name: "home" };
  return { name: "notfound" };
}
