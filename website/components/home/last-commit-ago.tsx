"use client";

import { useTimeAgo } from "@/lib/time-ago";

export function LastCommitAgo({ at, date }: { at: string; date: string }) {
  const ago = useTimeAgo(at, date);
  return (
    <time dateTime={at} title={new Date(at).toUTCString()}>
      {ago}
    </time>
  );
}
