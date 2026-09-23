"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LESSON_STEPS } from "@/components/home/lesson-data";
import { LessonRow } from "@/components/home/lesson-row";
import { YouTubeVideo } from "@/components/youtube-video";
import { youtubeLesson, youtubeWatchUrl } from "@/lib/youtube-lessons";

const PLAYER_ID = "how-it-works-player";

export function LessonPlayer() {
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const step = LESSON_STEPS[selected];
  const { id } = youtubeLesson(step.lesson);
  const next = selected + 1 < LESSON_STEPS.length ? selected + 1 : null;

  const select = (index: number) => {
    setSelected(index);
    setPicked(true);
    // On a phone the list sits under the player, so a pick lower down would
    // start a video the visitor can't see.
    playerRef.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:gap-10">
      <div id={PLAYER_ID} ref={playerRef} className="min-w-0">
        <YouTubeVideo
          key={step.lesson}
          lesson={step.lesson}
          autoPlay={picked}
          sizes="(min-width: 1024px) 700px, (min-width: 640px) 90vw, 100vw"
          className="rounded-xl shadow-2xl shadow-gray-300/60 ring-1 ring-black/5 dark:shadow-black/40 dark:ring-white/10"
        />
        <div className="mt-5">
          <p
            aria-live="polite"
            className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400"
          >
            Lesson {selected + 1} of {LESSON_STEPS.length}
            <span className="sr-only">: {step.title}</span>
          </p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {step.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {step.body}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5">
            <a
              href={youtubeWatchUrl(id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white"
            >
              Watch on YouTube
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            {next !== null && (
              <button
                type="button"
                onClick={() => select(next)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Next: {LESSON_STEPS[next].title}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <ol aria-label="Lessons" className="grid gap-1 md:grid-cols-2 lg:grid-cols-1">
        {LESSON_STEPS.map((s, i) => (
          <LessonRow
            key={s.lesson}
            index={i}
            title={s.title}
            blurb={s.blurb}
            lesson={s.lesson}
            active={i === selected}
            controls={PLAYER_ID}
            onSelect={() => select(i)}
          />
        ))}
      </ol>
    </div>
  );
}
