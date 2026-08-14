"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  poster: string;
  label: string;
  className?: string;
  width?: number;
  height?: number;
};

/**
 * Looping product footage that stays still for visitors who ask for reduced
 * motion — they get the poster frame, and everyone keeps native controls.
 * Playback starts from the effect rather than `autoPlay` so the reduced-motion
 * preference is known before the first frame plays, and only while the clip is
 * on screen so off-screen footage is never fetched or decoded. A visitor who
 * pauses with the native controls stays paused: scrolling away and back never
 * restarts a clip they stopped themselves.
 */
export function AutoVideo({
  src,
  poster,
  label,
  className,
  width = 1224,
  height = 804,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const ownPause = useRef(false);
  const userPaused = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const pause = () => {
      if (video.paused) return;
      ownPause.current = true;
      video.pause();
    };
    if (reduceMotion) {
      pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) pause();
        else if (!userPaused.current) void video.play().catch(() => {});
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduceMotion]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      width={width}
      height={height}
      controls
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      muted
      loop={!reduceMotion}
      playsInline
      preload="none"
      onPause={() => {
        if (ownPause.current) ownPause.current = false;
        else userPaused.current = true;
      }}
      onPlay={() => {
        userPaused.current = false;
      }}
      aria-label={label}
      className={className}
    />
  );
}
