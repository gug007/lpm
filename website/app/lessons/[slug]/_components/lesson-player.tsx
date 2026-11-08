"use client";

import { useEffect, useRef } from "react";
import { YouTubeVideo } from "@/components/youtube-video";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";
import { useLessonSeek } from "./lesson-seek";

const SIZES = "(min-width: 1152px) 800px, (min-width: 1024px) 70vw, 100vw";

// The lesson's player, which a chapter picked anywhere on the page starts from
// that chapter, brought back on screen if the visitor had scrolled past it.
export function LessonPlayer({ lesson }: { lesson: YouTubeLessonId }) {
  const { seek } = useLessonSeek();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!seek || !box) return;
    const { top, bottom } = box.getBoundingClientRect();
    if (top >= 0 && bottom <= window.innerHeight) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [seek]);

  return (
    <div ref={ref} className="scroll-mt-20">
      <YouTubeVideo
        key={seek?.run ?? 0}
        lesson={lesson}
        autoPlay={seek !== null}
        start={seek?.start}
        fetchPriority="high"
        sizes={SIZES}
        className="rounded-xl ring-1 ring-black/5 dark:ring-white/10"
      />
    </div>
  );
}
