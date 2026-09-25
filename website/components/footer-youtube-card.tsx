import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { YOUTUBE_CHANNEL_URL } from "@/lib/links";
import { youtubeLesson, youtubeThumbnailUrl } from "@/lib/youtube-lessons";

const COVER = youtubeLesson("sixty-seconds");

export function FooterYouTubeCard() {
  return (
    <a
      href={YOUTUBE_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="lpm video lessons on YouTube (@lpmcx)"
      className="group block max-w-60 rounded-lg focus-visible:outline-offset-4"
    >
      <div className="relative pt-3">
        <span
          aria-hidden="true"
          className="absolute inset-x-6 top-0 h-4 rounded-t-md bg-[#e3dccd] ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10 transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-1.5 h-4 rounded-t-md bg-[#d6cdbb] ring-1 ring-black/5 dark:bg-gray-700 dark:ring-white/10 transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-0.5"
        />
        <div className="relative aspect-video overflow-hidden rounded-lg bg-[#ebe5d9] ring-1 ring-black/5 dark:ring-white/10 shadow-sm transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-gray-300/50 dark:group-hover:shadow-black/40">
          <Image
            src={youtubeThumbnailUrl(COVER.id)}
            alt=""
            fill
            sizes="240px"
            className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
          />
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-gray-900/85 py-1 pl-1.5 pr-2.5 text-[11px] font-medium text-white shadow-md ring-1 ring-white/15 backdrop-blur-sm transition-colors duration-200 group-hover:bg-[#ff0033] group-hover:ring-transparent">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3.5 w-3.5 fill-current"
            >
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
            Watch
          </span>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1 text-[13px] font-medium text-gray-700 dark:text-gray-200 transition-colors duration-200 group-hover:text-gray-900 dark:group-hover:text-white">
        lpm on YouTube
        <ArrowUpRight
          aria-hidden="true"
          className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
        />
      </p>
      <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
        Short lessons · @lpmcx
      </p>
    </a>
  );
}
