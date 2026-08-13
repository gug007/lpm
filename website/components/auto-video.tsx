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
 * preference is known before the first frame plays.
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
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduceMotion(mq.matches);
      const video = ref.current;
      if (!video) return;
      if (mq.matches) video.pause();
      else void video.play().catch(() => {});
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
      aria-label={label}
      className={className}
    />
  );
}
