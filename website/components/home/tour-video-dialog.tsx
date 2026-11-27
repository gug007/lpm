"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { YouTubeVideo } from "@/components/youtube-video";
import { OVERVIEW_LESSON } from "./lesson-data";

// The three-minute tour, playing over the hero: the visitor keeps their place
// next to the download button and the live demo, and Esc takes them back.
export function TourVideoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus starts on Close: left to the dialog it lands in the YouTube frame,
  // which keeps Esc to itself.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={OVERVIEW_LESSON.title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(64rem,calc(100vw-2rem),calc((100dvh-8rem)*16/9))] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-gray-950/70 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="relative">
          <YouTubeVideo
            lesson={OVERVIEW_LESSON.lesson}
            autoPlay
            className="rounded-xl shadow-2xl ring-1 ring-white/10"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close video"
            className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </dialog>
  );
}
