import type { ReactNode } from "react";
import { Settings } from "lucide-react";

// The band's color, a shade off the card. The card's arrow grows out of the
// band, so it takes the same one.
export const ANSWER_CARD_FOOT_BG = "color-mix(in srgb, var(--bg-secondary), var(--bg-primary))";

interface AnswerCardFootProps {
  icon: ReactNode;
  children: ReactNode;
  onSettings: () => void;
}

// The foot of an answer tool's hover card, a band of its own: what the answer
// is made with, what that costs, and the settings that change it.
export function AnswerCardFoot({ icon, children, onSettings }: AnswerCardFootProps) {
  return (
    <div
      style={{ background: ANSWER_CARD_FOOT_BG }}
      className="flex items-center gap-[7px] border-t border-[var(--border)] py-1.5 pl-3.5 pr-2 text-[11.5px] leading-none text-[var(--text-muted)]"
    >
      {icon}
      <span className="min-w-0 truncate leading-normal">{children}</span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSettings}
        className="ml-auto flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] px-2 font-medium text-[var(--accent-violet-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-violet)_12%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40"
      >
        <Settings aria-hidden size={12} />
        Settings
      </button>
    </div>
  );
}
