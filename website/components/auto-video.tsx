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
 * motion — they get the poster frame plus native controls to play it manually.
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
      if (mq.matches) ref.current?.pause();
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
      autoPlay={!reduceMotion}
      controls={reduceMotion}
      muted
      loop={!reduceMotion}
      playsInline
      preload="none"
      aria-label={label}
      className={className}
    />
  );
}
