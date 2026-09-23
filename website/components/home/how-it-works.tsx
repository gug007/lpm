import { LessonPlayer } from "@/components/home/lesson-player";
import { SectionHeader } from "@/components/section-header";
import { YOUTUBE_PLAYLIST_URL } from "@/lib/youtube-lessons";

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-20 border-y border-gray-200 dark:border-gray-800/60 bg-gray-50/60 dark:bg-white/[0.015]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow="How it works"
          title="Add a folder. Start everything. Run agents in parallel."
          description="Six video lessons, recorded in the real app. Pick one to play it."
          className="mb-10"
        />

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
