import { useSyncExternalStore } from "react";

const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

const subscribe = (onChange: () => void) => {
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

const getSnapshot = () => mql.matches;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
