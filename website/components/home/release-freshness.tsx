"use client";

import Link from "next/link";
import { formatReleaseDate } from "@/lib/downloads";
import { CHANGELOG_PATH } from "@/lib/links";
import { useTimeAgo } from "@/lib/time-ago";

// lpm ships most days, which the version number alone never shows.
export function ReleaseFreshness({
  publishedAt,
  className,
}: {
  publishedAt: string;
  className: string;
}) {
  const ago = useTimeAgo(publishedAt, formatReleaseDate(publishedAt));

  return (
    <Link href={CHANGELOG_PATH} prefetch={false} className={className}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
      />
      <time dateTime={publishedAt}>Updated {ago}</time>
    </Link>
  );
}
