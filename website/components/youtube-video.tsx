"use client";

import Image from "next/image";
import { useState } from "react";
import {
  youtubeEmbedUrl,
  youtubeLesson,
  youtubeThumbnailUrl,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";

type Props = {
  lesson: YouTubeLessonId;
  className?: string;
  priority?: boolean;
};

/**
 * A YouTube lesson that costs the page one thumbnail until it is played: the
 * player iframe mounts on the first click, so a page with several lessons
 * never loads several players.
 */
export function YouTubeVideo({ lesson, className = "", priority }: Props) {
  const { id, name } = youtubeLesson(lesson);
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={`relative aspect-video overflow-hidden bg-[#ebe5d9] ${className}`}
    >
      {playing ? (
        <iframe
          src={`${youtubeEmbedUrl(id)}?autoplay=1&rel=0`}
          title={name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${name}`}
          className="group absolute inset-0 h-full w-full cursor-pointer"
        >
          <Image
            src={youtubeThumbnailUrl(id)}
            alt=""
            fill
            sizes="(min-width: 768px) 768px, 100vw"
            priority={priority}
            className="object-cover"
          />
          <span className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/10" />
          <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-gray-900/85 py-2 pl-3 pr-4 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/20 transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4 fill-current"
            >
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
            Play
          </span>
        </button>
      )}
    </div>
  );
}
