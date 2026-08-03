"use client";

import { useEffect } from "react";
import {
  isMacDownloadPlatform,
  usePlatform,
  type MacDownloadPlatform,
} from "@/lib/use-platform";

const LABELS: Record<MacDownloadPlatform, string> = {
  "mac-arm": "Detected: macOS Apple Silicon",
  "mac-intel": "Detected: macOS Intel",
};

export function HighlightPlatform() {
  const detected = usePlatform();

  useEffect(() => {
    if (!isMacDownloadPlatform(detected)) return;
    const selector = `.dl-card[data-platform="${detected}"]`;
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((el) => el.classList.add("recommended"));
    return () => nodes.forEach((el) => el.classList.remove("recommended"));
  }, [detected]);

  const label =
    detected === "mac-unknown"
      ? "Mac detected — choose Apple Silicon or Intel"
      : isMacDownloadPlatform(detected)
        ? LABELS[detected]
        : "";

  return (
    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-6 min-h-[1em]">
      {label}
    </p>
  );
}
