"use client";

import { useEffect } from "react";
import { usePlatform } from "@/lib/use-platform";

const LABELS: Record<string, string> = {
  "mac-arm": "Detected: macOS Apple Silicon",
  "mac-intel": "Detected: macOS Intel",
};

export function HighlightPlatform() {
  const detected = usePlatform();

  useEffect(() => {
    if (!detected) return;
    const selector = `.dl-card[data-platform="${detected}"]`;
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((el) => el.classList.add("recommended"));
    return () => nodes.forEach((el) => el.classList.remove("recommended"));
  }, [detected]);

  return (
    <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium mb-6 min-h-[1em]">
      {detected ? LABELS[detected] : ""}
    </p>
  );
}
