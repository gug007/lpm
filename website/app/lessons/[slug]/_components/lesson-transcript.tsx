import { formatLength } from "@/components/home/lesson-data";
import type { TranscriptPart } from "@/lib/lesson-transcript";
import { SeekButton } from "./seek-button";

export function LessonTranscript({ parts }: { parts: TranscriptPart[] }) {
  return (
    <section
      aria-labelledby="transcript-heading"
      className="border-t border-gray-200 pt-10 dark:border-gray-800"
    >
      <h2
        id="transcript-heading"
        className="text-xl font-bold tracking-tight text-gray-900 dark:text-white"
      >
        Transcript
      </h2>
      <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
        The narration, chapter by chapter. Pick a time to play from there.
      </p>
      <div className="mt-6 space-y-7">
        {parts.map(({ start, name, text }) => (
          <section key={start} aria-label={name}>
            <h3 className="flex items-baseline gap-3 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
              <SeekButton
                start={start}
                className="cursor-pointer rounded font-mono text-[12px] font-normal tabular-nums text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
              >
                <span className="sr-only">Play from </span>
                {formatLength(start)}
              </SeekButton>
              {name}
            </h3>
            <p className="mt-2 text-pretty text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
              {text}
            </p>
          </section>
        ))}
      </div>
    </section>
  );
}
