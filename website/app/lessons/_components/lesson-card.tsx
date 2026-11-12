import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { formatLength } from "@/components/home/lesson-data";
import { YouTubeVideo } from "@/components/youtube-video";
import { lessonPath } from "@/lib/links";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import { youtubeLesson, youtubeWatchUrl } from "@/lib/youtube-lessons";
import type { LessonCardData } from "./lesson-topics";
import { LessonWatchedMark } from "./lesson-watched-mark";

const SIZES = "(min-width: 1024px) 368px, (min-width: 640px) 50vw, 100vw";

export function LessonCard({ lesson, title }: LessonCardData) {
  const { id, description } = youtubeLesson(lesson);
  const { seconds, chapters } = LESSON_CHAPTERS[lesson];
  const url = youtubeWatchUrl(id);

  return (
    <li id={lesson} className="flex scroll-mt-24 flex-col">
      <YouTubeVideo
        lesson={lesson}
        sizes={SIZES}
        className="rounded-xl ring-1 ring-black/5 dark:ring-white/10"
      />
      <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        <Link
          href={lessonPath(lesson)}
          className="underline-offset-4 hover:underline"
        >
          {title}
        </Link>
      </h3>
      <p className="mt-0.5 font-mono text-[12px] tabular-nums text-gray-500 dark:text-gray-400">
        {formatLength(seconds)} · {chapters.length} chapters
        <LessonWatchedMark lesson={lesson} />
      </p>
      <p className="mt-2 line-clamp-3 text-pretty text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        {description}
      </p>
      <details className="group mt-2 text-[13px]">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
          Chapters
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ol className="mt-1 space-y-0.5">
          {chapters.map(([start, name]) => (
            <li key={start}>
              <a
                href={`${url}&t=${start}s`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 rounded-md py-1 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <span className="w-9 shrink-0 font-mono text-[12px] tabular-nums text-gray-400 dark:text-gray-500">
                  {formatLength(start)}
                </span>
                {name}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
