"use client";

import Image from "next/image";
import { useState } from "react";
import {
  youtubeEmbedUrl,
  youtubeLesson,
  youtubeThumbnailUrl,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";

type Poster = { src: string; label: string; title: string };

type Props = {
  lesson: YouTubeLessonId;
  className?: string;
  // A frame from the video in place of YouTube's thumbnail, which is a title
  // card; the frame carries the title over it instead.
  poster?: Poster;
  // The thumbnail stays lazy either way; "high" only moves it up the queue on
  // the one page where it is the first thing a phone sees. A preload would
  // fetch it at every width, including the ones that hide it.
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
  // Mounts the player straight away. Only for a lesson the visitor just
  // picked: a player that appears with the page stays click-to-play.
  autoPlay?: boolean;
};

/**
 * A YouTube lesson that costs the page one thumbnail until it is played: the
 * player iframe mounts on the first click, so a page with several lessons
 * never loads several players.
 */
export function YouTubeVideo({
  lesson,
  className = "",
  fetchPriority,
  sizes = "(min-width: 768px) 768px, 100vw",
  autoPlay = false,
  poster,
}: Props) {
  const { id, name } = youtubeLesson(lesson);
  const [playing, setPlaying] = useState(autoPlay);

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
          className="group absolute inset-0 h-full w-full cursor-pointer"
        >
          <Image
            src={poster?.src ?? youtubeThumbnailUrl(id)}
            alt=""
            fill
            sizes={sizes}
            fetchPriority={fetchPriority}
            className="object-cover"
          />
          {poster && (
            <span className="absolute inset-x-0 bottom-0 flex h-3/5 flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-16 text-left text-white sm:px-5 sm:pb-[4.5rem]">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/75">
                {poster.label}
              </span>
              <span className="mt-1 text-lg font-bold tracking-tight sm:text-2xl">
                {poster.title}
              </span>
            </span>
          )}
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
            {!poster && <span className="sr-only"> video: {name}</span>}
          </span>
        </button>
      )}
    </div>
  );
}
