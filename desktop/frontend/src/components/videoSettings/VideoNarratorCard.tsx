import type { LucideIcon } from "lucide-react";
import type { VideoNarrator } from "../../store/settings";

type Tone = "muted" | "ok" | "warn";

export interface NarratorFact {
  Icon: LucideIcon;
  text: string;
  tone?: Tone;
}

const TONE: Record<Tone, string> = {
  muted: "text-[var(--text-muted)]",
  ok: "text-[var(--accent-green)]",
  warn: "text-[var(--accent-amber)]",
};

// One narrator in the Video settings window: its name, its price and what
// picking it means. The whole card is the radio button.
export function VideoNarratorCard({
  narrator,
  on,
  onPick,
  Icon,
  title,
  price,
  per,
  facts,
}: {
  narrator: VideoNarrator;
  on: boolean;
  onPick: (narrator: VideoNarrator) => void;
  Icon: LucideIcon;
  title: string;
  price: string;
  per?: string;
  facts: NarratorFact[];
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      data-narrator={narrator}
      onClick={() => onPick(narrator)}
      className={`flex min-w-0 flex-col gap-2.5 rounded-[10px] border px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40 ${
        on
          ? "border-[var(--accent-violet)] bg-[color-mix(in_srgb,var(--accent-violet)_7%,var(--bg-secondary))] shadow-[inset_0_0_0_1px_var(--accent-violet)]"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        <Icon aria-hidden size={15} />
        {title}
        <span
          aria-hidden
          className={`ml-auto h-4 w-4 shrink-0 rounded-full ${
            on
              ? "border-[5px] border-[var(--accent-violet)] bg-[var(--bg-primary)]"
              : "border-[1.5px] border-[var(--text-muted)]"
          }`}
        />
      </span>
      <span className="text-xl leading-none font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        {price}
        {per && <span className="text-xs font-normal tracking-normal text-[var(--text-muted)]"> {per}</span>}
      </span>
      <span className="flex flex-col gap-1.5">
        {facts.map(({ Icon: FactIcon, text, tone = "muted" }) => (
          <span key={text} className="flex items-center gap-[7px] text-[11.5px] text-[var(--text-secondary)]">
            <FactIcon aria-hidden size={13} className={`shrink-0 ${TONE[tone]}`} />
            {text}
          </span>
        ))}
      </span>
    </button>
  );
}
