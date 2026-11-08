import Link from "next/link";
import { formatLength } from "@/components/home/lesson-data";
import { LESSONS_PATH } from "@/lib/links";
import type { LessonTopic } from "../../_components/lesson-topics";

const LINK =
  "transition-colors hover:text-gray-900 dark:hover:text-white";

export function LessonHeader({
  title,
  topic,
  seconds,
  chapterCount,
  uploadDate,
}: {
  title: string;
  topic: LessonTopic;
  seconds: number;
  chapterCount: number;
  uploadDate: string;
}) {
  const published = new Date(uploadDate);
  return (
    <header className="max-w-3xl">
      <nav
        aria-label="Breadcrumb"
        className="text-sm text-gray-500 dark:text-gray-400"
      >
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={LESSONS_PATH} className={LINK}>
              Lessons
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`${LESSONS_PATH}#${topic.id}`} className={LINK}>
              {topic.title}
            </Link>
          </li>
        </ol>
      </nav>
      <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
        {title}
      </h1>
      <p className="mt-3 font-mono text-[13px] tabular-nums text-gray-500 dark:text-gray-400">
        {formatLength(seconds)} · {chapterCount} chapters ·{" "}
        <time dateTime={uploadDate}>
          {published.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </p>
    </header>
  );
}
