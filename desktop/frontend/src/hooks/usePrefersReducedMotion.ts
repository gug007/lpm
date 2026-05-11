import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// React-friendly subscription to the OS reduced-motion preference.
// Components use this to gate animations and transitions so users who
// have asked for less motion don't see overshoot, scale, or lengthy
// fades.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduced;
}
