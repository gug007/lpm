import { ArrowUpRight, Play } from "lucide-react";
import { formatLength } from "@/components/home/lesson-data";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import { YOUTUBE_PLAYLIST_URL } from "@/lib/youtube-lessons";
import { ALL_LESSONS_MINUTES, LESSON_IDS } from "./lesson-topics";

const TOUR = "lpm-in-3-minutes";

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-8 text-center">
      <div className="mx-auto max-w-3xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          Lessons
        </p>
        <h1 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          Learn lpm in short videos
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          {LESSON_IDS.length} lessons recorded in the real app,{" "}
          {ALL_LESSONS_MINUTES} minutes in all. Start with the three-minute
          tour, then jump to what you need.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={`#${TOUR}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gray-900 px-6 text-[15px] font-medium text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Start with the tour
            <span className="font-mono text-[13px] tabular-nums opacity-70">
              {formatLength(LESSON_CHAPTERS[TOUR].seconds)}
            </span>
          </a>
          <a
            href={YOUTUBE_PLAYLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-gray-300 px-6 text-[15px] font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
          >
            YouTube playlist
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
