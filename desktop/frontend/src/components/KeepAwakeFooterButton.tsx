import type { ReactNode } from "react";
import { type KeepAwakeSession, useKeepAwakeLeft, useKeepAwakeSpan } from "../hooks/useKeepAwakeSession";
import { keepAwakeCupLabel } from "../keepAwake";
import { keepAwakeCup } from "../keepAwakeCup";
import { KeepAwakeCupIcon } from "./KeepAwakeCupIcon";
import { Tooltip } from "./ui/Tooltip";

const TONE = {
  held: "text-[var(--text-primary)]",
  ending: "text-[var(--accent-amber-text)]",
  ready: "text-[var(--text-muted)]",
  stopped: "text-[var(--text-muted)]",
} as const;

const TEXT_TONE = {
  held: "font-semibold text-[var(--text-secondary)]",
  ending: "font-semibold",
  ready: "font-medium",
  stopped: "font-medium",
} as const;

// The footer's own button while Keep awake is on and its row is folded into
// More, so the state isn't hidden behind a menu. Holding, the cup is the text
// color with coffee that drains with the time left, and beside it how many
// agents hold it or the time left; it turns amber only in the last five
// minutes, with the heads-up toast. An empty gray cup is on but not holding:
// waiting for an agent, or with a battery or "!" on its corner when it can't.
// It speaks for this machine only: connected computers are in `card`, shown on
// rest, and in the menu a click opens.
export function KeepAwakeFooterButton({
  session,
  card,
  menuOpen,
  onToggleMenu,
  className,
}: {
  session: KeepAwakeSession;
  card: ReactNode;
  menuOpen: boolean;
  onToggleMenu: (trigger: HTMLElement) => void;
  className: string;
}) {
  const { state, endsAt } = session;
  const left = useKeepAwakeLeft(endsAt);
  const total = useKeepAwakeSpan(endsAt);
  const look = keepAwakeCup(state, left, total);
  if (!state || !look) return null;
  const wide = look.text !== null;

  return (
    <Tooltip content={card} side="top" wide interactive delay={150} triggerClassName="inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => onToggleMenu(e.currentTarget)}
        aria-expanded={menuOpen}
        aria-label={`Keep awake: ${keepAwakeCupLabel(state, left)}`}
        className={`${className} gap-1.5 ${wide ? "w-auto min-w-9 px-2" : ""} ${TONE[look.tone]} ${
          menuOpen ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="relative flex">
          <KeepAwakeCupIcon level={look.level} ending={look.tone === "ending"} />
          {look.mark && (
            <span
              aria-hidden
              className={`absolute -bottom-1 -right-1.5 flex h-[11px] min-w-[11px] items-center justify-center rounded-full text-[8px] font-bold leading-none ring-[1.5px] ring-[var(--bg-sidebar)] ${
                look.mark === "error"
                  ? "bg-[var(--accent-amber)] text-[var(--bg-primary)]"
                  : "bg-[var(--bg-active)] text-[var(--text-secondary)]"
              }`}
            >
              {look.mark === "error" ? (
                "!"
              ) : (
                <svg width="9" height="8" viewBox="0 0 13 12" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
                  <rect x="1" y="3.2" width="9" height="5.6" rx="1.3" />
                  <path d="M12 5.2v1.6M2 10.6 9.5 1.4" />
                </svg>
              )}
            </span>
          )}
        </span>
        {look.text && (
          <span aria-hidden className={`text-[11px] leading-none tabular-nums ${TEXT_TONE[look.tone]}`}>
            {look.text}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
