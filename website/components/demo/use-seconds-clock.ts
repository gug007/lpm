"use client";

import { useEffect, useState } from "react";

/** A once-a-second reading of the wall clock, shared by everything that shows
 *  an elapsed time. Paused subscribers never schedule a tick, so a reading that
 *  has stopped moving costs nothing. */
export function useSecondsClock(paused: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [paused]);
  return now;
}

/** How long something took, in the app's shape: seconds under a minute, then
 *  minutes, then hours and minutes. */
export function shortDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
