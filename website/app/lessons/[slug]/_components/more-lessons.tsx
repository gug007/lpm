import Image from "next/image";
import Link from "next/link";
import { formatLength } from "@/components/home/lesson-data";
import { LESSONS_PATH, lessonPath } from "@/lib/links";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import {
  youtubeLesson,
  youtubeThumbnailUrl,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";
import type { LessonTopic } from "../../_components/lesson-topics";

const SIZES = "(min-width: 1024px) 270px, (min-width: 640px) 45vw, 100vw";

// The other lessons filed under the same topic, so a visitor who came in
// from a search can carry on with the next thing.
export function MoreLessons({
  topic,
  current,
}: {
  topic: LessonTopic;
  current: YouTubeLessonId;
}) {
  const others = topic.lessons.filter(({ lesson }) => lesson !== current);
  if (!others.length) return null;
  return (
    <section
      aria-labelledby="more-heading"
      className="mx-auto max-w-6xl border-t border-gray-200 px-6 py-12 dark:border-gray-800"
    >
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2
          id="more-heading"
          className="text-xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
          More in {topic.title}
        </h2>
        <Link
          href={LESSONS_PATH}
          className="shrink-0 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          All lessons
        </Link>
      </div>
      <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {others.map(({ lesson, title }) => (
          <li key={lesson}>
            <Link href={lessonPath(lesson)} className="group block">
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-[#ebe5d9] ring-1 ring-black/5 dark:ring-white/10">
                <Image
                  src={youtubeThumbnailUrl(youtubeLesson(lesson).id)}
                  alt=""
                  fill
                  sizes={SIZES}
                  className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </span>
              <span className="mt-2.5 block text-[14px] font-semibold tracking-tight text-gray-900 group-hover:underline group-hover:underline-offset-4 dark:text-gray-100">
                {title}
              </span>
              <span className="mt-0.5 block font-mono text-[12px] tabular-nums text-gray-500 dark:text-gray-400">
                {formatLength(LESSON_CHAPTERS[lesson].seconds)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
