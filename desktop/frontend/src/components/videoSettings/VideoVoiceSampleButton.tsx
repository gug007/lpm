import { Loader2, Play, Square } from "lucide-react";
import type { VoiceSampleState } from "../../hooks/useVoiceSample";
import { Tooltip } from "../ui/Tooltip";

// ▶ beside the voice picker: a few seconds of the picked voice. `unavailable`
// says why it can't speak yet, and the button waits.
export function VideoVoiceSampleButton({
  voice,
  name,
  sample,
  unavailable,
  onPlay,
  onStop,
}: {
  voice: string;
  name: string;
  sample: VoiceSampleState | null;
  unavailable: string | null;
  onPlay: (voice: string) => void;
  onStop: () => void;
}) {
  const mine = sample?.voice === voice ? sample.phase : null;
  const label = unavailable ?? (mine ? "Stop" : `Hear ${name}`);
  const Icon = mine === "loading" ? Loader2 : mine === "playing" ? Square : Play;

  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={unavailable !== null}
        onClick={() => {
          if (unavailable) return;
          if (mine) onStop();
          else onPlay(voice);
        }}
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-primary)] transition-colors ${
          unavailable
            ? "cursor-default text-[var(--text-muted)] opacity-50"
            : mine
              ? "text-[var(--accent-violet)] hover:bg-[var(--bg-active)]"
              : "text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
        }`}
      >
        <Icon
          aria-hidden
          size={12}
          fill={mine === "loading" ? "none" : "currentColor"}
          className={mine === "loading" ? "animate-spin" : undefined}
        />
      </button>
    </Tooltip>
  );
}
