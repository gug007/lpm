import Link from "next/link";
import { findLesson } from "@/app/lessons/_components/lesson-topics";
import { formatLength } from "@/components/home/lesson-data";
import { LINK } from "@/components/prose";
import { YouTubeVideo } from "@/components/youtube-video";
import { lessonPath } from "@/lib/links";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

export function GuideLesson({ lesson }: { lesson: YouTubeLessonId }) {
  const title = findLesson(lesson)?.title;
  return (
    <figure className="mb-2">
      <YouTubeVideo
        lesson={lesson}
        className="rounded-xl ring-1 ring-black/5 dark:ring-white/10"
      />
      <figcaption className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Lesson · {formatLength(LESSON_CHAPTERS[lesson].seconds)}
        {title && (
          <>
            {" · "}
            <Link href={lessonPath(lesson)} className={LINK}>
              {title}
            </Link>
            , with chapters and a transcript
          </>
        )}
      </figcaption>
    </figure>
  );
}
