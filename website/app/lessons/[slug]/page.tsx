import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/home/cta-band";
import { lessonTranscript } from "@/lib/lesson-transcript";
import { LESSONS_PATH, lessonPath } from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import { youtubeLesson, youtubeWatchUrl } from "@/lib/youtube-lessons";
import { lessonReading } from "../_components/lesson-reading";
import { findLesson, LESSON_IDS } from "../_components/lesson-topics";
import { LessonChapterList } from "./_components/lesson-chapter-list";
import { LessonHeader } from "./_components/lesson-header";
import { LessonPlayer } from "./_components/lesson-player";
import { LessonReadingList } from "./_components/lesson-reading-list";
import { LessonSeekProvider } from "./_components/lesson-seek";
import { LessonTranscript } from "./_components/lesson-transcript";
import { MoreLessons } from "./_components/more-lessons";

type Props = { params: Promise<{ slug: string }> };

const SNIPPET_MAX = 160;

// The lesson's description cut at a sentence end, short enough for a search
// result; a first sentence that is already longer stands on its own.
function snippet(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) ?? [text];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > SNIPPET_MAX) break;
    out += sentence;
  }
  return (out || sentences[0]).trim();
}

export const dynamicParams = false;

export function generateStaticParams() {
  return LESSON_IDS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findLesson((await params).slug);
  if (!found) return {};
  const { name, description } = youtubeLesson(found.lesson);
  const summary = snippet(description);
  const path = lessonPath(found.lesson);
  return {
    // The video titles are written for search and most already say lpm.
    title: name.includes("lpm") ? { absolute: name } : name,
    description: summary,
    alternates: { canonical: path },
    openGraph: {
      title: name,
      description: summary,
      type: "website",
      url: path,
      siteName: "lpm",
    },
    twitter: { card: "summary_large_image", title: name, description: summary },
  };
}

export default async function LessonPage({ params }: Props) {
  const found = findLesson((await params).slug);
  if (!found) notFound();
  const { lesson, title, topic } = found;
  const { id, description, uploadDate } = youtubeLesson(lesson);
  const { seconds, chapters } = LESSON_CHAPTERS[lesson];
  const transcript = lessonTranscript(lesson);
  const path = lessonPath(lesson);

  const structuredData = [
    {
      ...youtubeLessonJsonLd(lesson),
      ...(transcript.length
        ? { transcript: transcript.map((part) => part.text).join("\n\n") }
        : {}),
    },
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Lessons", path: LESSONS_PATH },
      { name: title, path },
    ]),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <LessonSeekProvider>
        <article className="mx-auto max-w-6xl px-6 pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-14">
          <LessonHeader
            title={title}
            topic={topic}
            seconds={seconds}
            chapterCount={chapters.length}
            uploadDate={uploadDate}
          />
          {/* A phone reads the chapters before the transcript; from lg up
              they sit in a column beside both. */}
          <div className="mt-8 grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr]">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <LessonPlayer lesson={lesson} />
              <p className="mt-5 max-w-3xl text-pretty text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
                {description}
              </p>
            </div>
            <aside className="space-y-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <LessonChapterList chapters={chapters} />
              <LessonReadingList
                reading={lessonReading(lesson)}
                watchUrl={youtubeWatchUrl(id)}
              />
            </aside>
            {transcript.length > 0 && (
              <div className="min-w-0 lg:col-start-1 lg:row-start-2">
                <LessonTranscript parts={transcript} />
              </div>
            )}
          </div>
        </article>
      </LessonSeekProvider>
      <MoreLessons topic={topic} current={lesson} />
      <CtaBand source="lesson-cta" />
    </>
  );
}
