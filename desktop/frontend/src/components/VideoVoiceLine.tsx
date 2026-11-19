import { Cloud, Laptop, Settings } from "lucide-react";
import { openVideoSettings } from "../store/videoSettings";
import { useVideoVoice, videoVoiceSummary } from "../videoVoice";

// The foot of the Video button's hover card: who will voice the answer, what
// that costs, and the Video settings window to change it.
export function VideoVoiceLine() {
  const voice = useVideoVoice();
  const { label, cost } = videoVoiceSummary(voice);
  const Icon = voice.narrator === "openai" ? Cloud : Laptop;

  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
      <Icon
        aria-hidden
        size={12}
        className={voice.narrator === "openai" ? "text-[var(--accent-violet)]" : "text-[var(--accent-green)]"}
      />
      <span className="min-w-0 truncate">
        <span className="text-[var(--text-secondary)]">{label}</span> · {cost}
      </span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openVideoSettings}
        className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--accent-violet-text)] transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40"
      >
        <Settings aria-hidden size={11} />
        Settings
      </button>
    </div>
  );
}
