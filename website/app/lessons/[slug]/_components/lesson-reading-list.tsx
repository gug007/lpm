import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Reading } from "../../_components/lesson-reading";
import { SIDE_ROW, SideSection } from "./side-section";

export function LessonReadingList({
  reading,
  watchUrl,
}: {
  reading: Reading[];
  watchUrl: string;
}) {
  return (
    <SideSection id="reading-heading" title="Read more">
      <ul className="mt-3 space-y-0.5">
        {reading.map(({ href, label, kind }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-baseline justify-between gap-3 ${SIDE_ROW}`}
            >
              {label}
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {kind}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1 ${SIDE_ROW}`}
          >
            Watch on YouTube
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </li>
      </ul>
    </SideSection>
  );
}
