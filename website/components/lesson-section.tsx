import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { YouTubeVideo } from "@/components/youtube-video";
import { LESSONS_PATH } from "@/lib/links";
import {
  YOUTUBE_LESSON_COUNT,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";

type Step = {
  title: string;
  body: string;
};

type Props = {
  lesson: YouTubeLessonId;
  title: string;
  description: string;
  steps: Step[];
  // A page with a second lesson gives it its own anchor.
  id?: string;
};

/** A page's "Watch it" section: one lesson from the series beside the steps it
 *  walks through, with a link to every other lesson. */
export function LessonSection({ lesson, title, description, steps, id = "watch" }: Props) {
  return (
    <section id={id} className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader eyebrow="Watch it" title={title} description={description} />

        <div className="grid items-center gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <YouTubeVideo
              lesson={lesson}
              className="rounded-xl shadow-2xl shadow-gray-200/60 ring-1 ring-black/5 dark:shadow-black/40 dark:ring-white/10"
            />
          </div>

          <div className="lg:col-span-2">
            <ol className="space-y-6">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 text-xs font-semibold tabular-nums text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              href={LESSONS_PATH}
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              All {YOUTUBE_LESSON_COUNT} lpm lessons
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
