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

// Parse a path like "/anime/12345" -> { name, params }
export type Route =
  | { name: "home" }
  | { name: "anime"; id: number }
  | { name: "notfound" };

export function matchRoute(p: string): Route {
  const m = p.match(/^\/anime\/(\d+)$/);
  if (m) return { name: "anime", id: Number(m[1]) };
  if (p === "/" || p === "") return { name: "home" };
  return { name: "notfound" };
}
