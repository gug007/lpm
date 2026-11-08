"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { formatLength, OVERVIEW_LESSON } from "@/components/home/lesson-data";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

// Long enough that a normal connection never sees the way out.
const OFFER_AFTER_MS = 6000;

type Props = {
  // From 0 to 1.
  progress: number;
  // The video on offer for a slow load. Without one the status only reports.
  lesson?: YouTubeLessonId;
  onWatch?: () => void;
};

export function DemoLoadStatus({ progress, lesson, onWatch }: Props) {
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    if (!lesson) return;
    const timer = window.setTimeout(() => setOffered(true), OFFER_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [lesson]);

  const percent = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="text-[13px] text-[#919191]">Loading the demo</span>
      <div
        role="progressbar"
        aria-label="Loading the demo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 w-56 overflow-hidden rounded-full bg-[#2e2e2e]"
      >
        <div
          className="h-full rounded-full bg-[#e5e5e5] motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-[#919191]">{percent}%</span>
      {/* Holds its space from the start, so the bar doesn't jump when it shows. */}
      {lesson && (
        <button
          type="button"
          onClick={onWatch}
          className={`mt-2 inline-flex items-center gap-2 rounded-lg border border-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e5e5e5] transition-[opacity,background-color] duration-300 hover:bg-white/[0.06] ${
            offered ? "opacity-100" : "invisible opacity-0"
          }`}
        >
          <Play className="h-3 w-3 fill-current" aria-hidden="true" />
          {lesson === OVERVIEW_LESSON.lesson
            ? "Watch the 3-minute tour instead"
            : "Watch the video instead"}
          <span className="tabular-nums text-[#919191]">
            {formatLength(LESSON_CHAPTERS[lesson].seconds)}
          </span>
        </button>
      )}
    </div>
  );
}
