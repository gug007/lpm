import { DictationWaveform } from "../dictation/DictationWaveform";

interface TalkVoiceTraceProps {
  // The recording has ended and is being transcribed.
  frozen: boolean;
  // Something is being waited on: the line under the trace runs.
  busy: boolean;
  // How far the wait has got, 0…1, when VoiceToText knows.
  progress: number | null;
}

// The take while it's spoken: the level trace, and under it the line that
// runs while VoiceToText starts up or writes the words down. No words show
// until they're final.
export function TalkVoiceTrace({ frozen, busy, progress }: TalkVoiceTraceProps) {
  return (
    <div aria-hidden className="flex flex-col gap-2 py-1">
      <div className="flex">
        <DictationWaveform frozen={frozen} className="h-10" />
      </div>
      <div className={`h-[2px] overflow-hidden rounded-full ${busy ? "bg-[var(--dictation-track)]" : ""}`}>
        {busy && (
          <div
            className="dictation-progress h-full rounded-full bg-[var(--dictation-ink)]"
            data-indeterminate={progress == null || undefined}
            style={progress != null ? { width: `${Math.round(progress * 100)}%` } : undefined}
          />
        )}
      </div>
    </div>
  );
}
