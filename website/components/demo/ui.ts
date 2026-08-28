"use client";

import { useEffect, useState } from "react";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#60a5fa]";

export const PRESS = "transition-all duration-100 active:scale-[0.97]";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
