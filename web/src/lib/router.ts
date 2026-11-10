// Path is reactive via Svelte store; navigate() pushes state and updates it.
// Uses pathname + search so query params (e.g. ?aid=) are preserved.
import { writable } from "svelte/store";

export const path = writable(
  typeof window !== "undefined"
    ? window.location.pathname + window.location.search
    : "/",
);

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", to);
  path.set(to);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () =>
    path.set(window.location.pathname + window.location.search),
  );
}

export type Route =
  | { name: "home" }
  | { name: "anime"; id: number }
  | {
      name: "watch";
      provider: string;
      animeId: number;
      slug: string;
      episodeId: string;
    }
  | { name: "notfound" };

export function matchRoute(p: string): Route {
  // Split path + query so the episodeId regex doesn't capture ?aid=
  const [pathname] = p.split("?");
  const watch = pathname?.match(/^\/watch\/([^/]+)\/(\d+)\/([^/]+)\/([^/]+)$/);
  if (watch?.[1] && watch[2] && watch[3] && watch[4]) {
    return {
      name: "watch",
      provider: decodeURIComponent(watch[1]),
      animeId: Number(watch[2]),
      slug: decodeURIComponent(watch[3]),
      episodeId: decodeURIComponent(watch[4]),
    };
  }
  const m = pathname?.match(/^\/anime\/(\d+)$/);
  if (m?.[1]) return { name: "anime", id: Number(m[1]) };
  if (pathname === "/" || pathname === "") return { name: "home" };
  return { name: "notfound" };
}
