import transcripts from "./lesson-transcripts.json";
import { LESSON_CHAPTERS } from "./youtube-chapters";
import type { YouTubeLessonId } from "./youtube-lessons";

type Cue = [start: number, words: string];

// Each lesson's captions, the same .srt YouTube shows, copied in by
// scripts/import-lesson-transcripts.mjs.
const TRANSCRIPTS = transcripts as unknown as Partial<
  Record<YouTubeLessonId, Cue[]>
>;

// Chapter starts are whole seconds, so a line that begins a moment before one
// already belongs to it.
const LEAD_S = 0.5;

export type TranscriptPart = { start: number; name: string; text: string };

// The captions as one paragraph per chapter; empty for a lesson without them.
export function lessonTranscript(lesson: YouTubeLessonId): TranscriptPart[] {
  const cues = TRANSCRIPTS[lesson] ?? [];
  const { chapters } = LESSON_CHAPTERS[lesson];
  return chapters
    .map(([start, name], i) => {
      const end = chapters[i + 1]?.[0] ?? Infinity;
      const text = cues
        .filter(([at]) => at + LEAD_S >= start && at + LEAD_S < end)
        .map(([, words]) => words)
        .join(" ");
      return { start, name, text };
    })
    .filter((part) => part.text);
}
