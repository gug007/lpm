"use client";

import { Check } from "lucide-react";
import { useWatchedLessons } from "@/lib/watched-lessons";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

export function LessonWatchedMark({ lesson }: { lesson: YouTubeLessonId }) {
  const watched = useWatchedLessons();
  if (!watched.has(lesson)) return null;

  return (
    <>
      {" · "}
      <span className="inline-flex items-center gap-1 font-sans font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        Watched
      </span>
    </>
  );
}
