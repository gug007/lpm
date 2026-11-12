"use client";

import { Check, Play } from "lucide-react";
import { clearWatchedLessons, useWatchedLessons } from "@/lib/watched-lessons";
import type { LessonCardData } from "./lesson-topics";

export type ProgressLesson = LessonCardData & { seconds: number };

// Only for a visitor who has played something: a first visit sees the page
// as it is served, and nothing moves after it loads.
export function LessonsProgress({ lessons }: { lessons: ProgressLesson[] }) {
  const watched = useWatchedLessons();
  const left = lessons.filter(({ lesson }) => !watched.has(lesson));
  const done = lessons.length - left.length;
  if (done === 0) return null;

  const next = left[0];
  const minutesLeft = Math.max(
    1,
    Math.round(left.reduce((sum, { seconds }) => sum + seconds, 0) / 60),
  );

  return (
    <section aria-label="Your progress" className="mx-auto max-w-6xl px-6 pb-8">
      <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50/60 px-5 py-4 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {next
              ? `Continue: lesson ${lessons.indexOf(next) + 1} of ${lessons.length}`
              : `All ${lessons.length} lessons watched`}
          </p>
          <div
            role="progressbar"
            aria-label="Lessons watched"
            aria-valuemin={0}
            aria-valuemax={lessons.length}
            aria-valuenow={done}
            className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          >
            <div
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${(done / lessons.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-gray-500 dark:text-gray-400">
            <span className="tabular-nums">
              {done} watched
              {next && ` · ${minutesLeft} min left`}
            </span>
            {" · "}
            <button
              type="button"
              onClick={clearWatchedLessons}
              className="cursor-pointer underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:decoration-gray-600 dark:hover:text-white"
            >
              Reset
            </button>
          </p>
        </div>
        {next ? (
          <a
            href={`#${next.lesson}`}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-gray-700 sm:max-w-[55%] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{next.title}</span>
          </a>
        ) : (
          <Check
            className="hidden h-6 w-6 shrink-0 text-emerald-600 sm:block dark:text-emerald-400"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}
