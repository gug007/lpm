import { Cloud, Laptop, Settings } from "lucide-react";
import { openVideoSettings } from "../store/videoSettings";
import { useVideoVoice, videoVoiceSummary } from "../videoVoice";

// The band's color, a shade off the card. The card's arrow grows out of the
// band, so it takes the same one.
export const VIDEO_CARD_FOOT_BG = "color-mix(in srgb, var(--bg-secondary), var(--bg-primary))";

// The foot of the Video button's hover card, a band of its own: who will voice
// the answer, what that costs, and the Video settings window to change it.
export function VideoVoiceLine() {
  const voice = useVideoVoice();
  const { name, where, cost } = videoVoiceSummary(voice);
  const Icon = voice.narrator === "openai" ? Cloud : Laptop;

  return (
    <div
      style={{ background: VIDEO_CARD_FOOT_BG }}
      className="flex items-center gap-[7px] border-t border-[var(--border)] py-1.5 pl-3.5 pr-2 text-[11.5px] leading-none text-[var(--text-muted)]"
    >
      <Icon
        aria-hidden
        size={13}
        className={`shrink-0 ${voice.narrator === "openai" ? "text-[var(--accent-violet)]" : "text-[var(--accent-green)]"}`}
      />
      <span className="min-w-0 truncate leading-normal">
        <span className="text-[var(--text-primary)]">{name}</span> · {where} · {cost}
      </span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openVideoSettings}
        className="ml-auto flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] px-2 font-medium text-[var(--accent-violet-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-violet)_12%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40"
      >
        <Settings aria-hidden size={12} />
        Settings
      </button>
    </div>
  );
}
