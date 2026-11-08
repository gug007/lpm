"use client";

import type { ReactNode } from "react";
import { useLessonSeek } from "./lesson-seek";

export function SeekButton({
  start,
  className,
  children,
}: {
  start: number;
  className?: string;
  children: ReactNode;
}) {
  const { seekTo } = useLessonSeek();
  return (
    <button type="button" onClick={() => seekTo(start)} className={className}>
      {children}
    </button>
  );
}
