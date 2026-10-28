import { HowItWorksSteps } from "@/components/home/how-it-works-steps";
import { LESSONS_TOTAL_MINUTES } from "@/components/home/lesson-data";
import { LessonPlayer } from "@/components/home/lesson-player";
import { SectionHeader } from "@/components/section-header";
import { YOUTUBE_PLAYLIST_URL } from "@/lib/youtube-lessons";

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-20 border-y border-gray-200 dark:border-gray-800/60 bg-gray-50/60 dark:bg-white/[0.015]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow="How it works"
          title="Up and running in three steps"
          className="mb-8 sm:mb-10"
        />

        <HowItWorksSteps />

        <div
          id="lessons"
          className="mt-14 mb-6 scroll-mt-20 text-center sm:mt-16 sm:mb-8"
        >
          <h3 className="text-balance text-lg font-semibold tracking-tight text-gray-900 sm:text-xl dark:text-gray-100">
            Watch it in the real app
          </h3>
          <p className="mt-1.5 text-pretty text-sm text-gray-500 dark:text-gray-400">
            Six lessons, {LESSONS_TOTAL_MINUTES} minutes in all. Start with
            the three-minute overview.
          </p>
        </div>

        <LessonPlayer />

        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Want the full series?{" "}
          <a
            href={YOUTUBE_PLAYLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:decoration-gray-600 dark:hover:text-white"
          >
            Watch every lesson on YouTube
          </a>
          .
        </p>
      </div>
    </section>
  );
}
