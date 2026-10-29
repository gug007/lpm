import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { formatLength, OVERVIEW_LESSON } from "@/components/home/lesson-data";
import { youtubeLesson, youtubeWatchUrl } from "@/lib/youtube-lessons";

// A frame of the app itself as the poster: the channel's own thumbnails share
// one title card that shows no app.
export function FooterYouTubeCard() {
  const { id } = youtubeLesson(OVERVIEW_LESSON.lesson);
  return (
    <a
      href={youtubeWatchUrl(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="group block max-w-60 rounded-lg focus-visible:outline-offset-4"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-[#1a1a1a] ring-1 ring-black/10 shadow-sm transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-gray-300/50 dark:ring-white/10 dark:group-hover:shadow-black/40">
        <Image
          src={OVERVIEW_LESSON.thumbnail}
          alt=""
          fill
          sizes="240px"
          className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
        />
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-gray-900/85 py-1 pl-1.5 pr-2.5 text-[11px] font-medium tabular-nums text-white shadow-md ring-1 ring-white/15 backdrop-blur-sm transition-colors duration-200 group-hover:bg-gray-900">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-3.5 w-3.5 fill-current"
          >
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
          {formatLength(OVERVIEW_LESSON.seconds)}
        </span>
      </div>
      <p className="mt-3 flex items-center gap-1 text-[13px] font-medium text-gray-700 dark:text-gray-200 transition-colors duration-200 group-hover:text-gray-900 dark:group-hover:text-white">
        {OVERVIEW_LESSON.title}
        <ArrowUpRight
          aria-hidden="true"
          className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
        />
      </p>
      <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
        Short lessons on YouTube · @lpmcx
      </p>
    </a>
  );
}
