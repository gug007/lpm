import { formatLength } from "@/components/home/lesson-data";
import type { LessonChapters } from "@/lib/youtube-chapters";
import { SeekButton } from "./seek-button";
import { SIDE_ROW, SideSection } from "./side-section";

export function LessonChapterList({
  chapters,
}: {
  chapters: LessonChapters["chapters"];
}) {
  return (
    <SideSection id="chapters-heading" title="Chapters">
      <ol className="mt-3 space-y-0.5">
        {chapters.map(([start, name]) => (
          <li key={start}>
            <SeekButton
              start={start}
              className={`flex w-full cursor-pointer gap-3 text-left ${SIDE_ROW}`}
            >
              <span className="w-9 shrink-0 font-mono text-[12px] leading-[1.6rem] tabular-nums text-gray-400 dark:text-gray-500">
                {formatLength(start)}
              </span>
              <span>
                <span className="sr-only">Play from </span>
                {name}
              </span>
            </SeekButton>
          </li>
        ))}
      </ol>
    </SideSection>
  );
}
