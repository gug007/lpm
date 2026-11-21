import type { ReactNode } from "react";
import { type KeepAwakeSession, useKeepAwakeLeft, useKeepAwakeSpan } from "../hooks/useKeepAwakeSession";
import { keepAwakeCup, keepAwakeCupLabel } from "../keepAwake";
import { CoffeeIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

const RING_RADIUS = 12.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const TONE = {
  held: "text-[var(--accent-amber-text)]",
  ready: "text-[var(--text-muted)]",
  stopped: "text-[var(--text-muted)]",
} as const;

// The footer's own button while Keep awake is on and its row is folded into
// More, so the state isn't hidden behind a menu. A dim cup is ready for the
// next agent; an amber one holds the machine, with how many agents hold it or
// the time left after them beside it, or a ring that drains with a set time; a
// gray one with "!" is on but can't hold. Resting on it shows `card`, and a
// click opens the whole menu.
export function KeepAwakeFooterButton({
  session,
  othersOn,
  card,
  menuOpen,
  onToggleMenu,
  className,
}: {
  session: KeepAwakeSession;
  /** Connected computers whose Keep awake is on. */
  othersOn: number;
  card: ReactNode;
  menuOpen: boolean;
  onToggleMenu: (trigger: HTMLElement) => void;
  className: string;
}) {
  const { state, endsAt } = session;
  const left = useKeepAwakeLeft(endsAt);
  const total = useKeepAwakeSpan(endsAt);
  const look = keepAwakeCup(state, left, othersOn);
  if (!look) return null;
  const ring = look.ring && left !== null && total !== null ? Math.min(1, left / total) : null;
  const localOn = state !== null && state.mode !== "off";
  const label = localOn
    ? keepAwakeCupLabel(state, left)
    : `${othersOn} ${othersOn === 1 ? "other computer" : "other computers"} kept awake`;

  return (
    <Tooltip content={card} side="top" wide interactive delay={150} triggerClassName="inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => onToggleMenu(e.currentTarget)}
        aria-expanded={menuOpen}
        aria-label={`Keep awake: ${label}`}
        className={`${className} relative gap-1 ${look.text ? "w-auto min-w-9 px-2" : ""} ${TONE[look.tone]} ${
          look.tone === "ready" ? "border border-dashed border-[var(--border)]" : ""
        } ${
          menuOpen ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
        }`}
      >
        {ring !== null && (
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            aria-hidden="true"
            className="absolute inset-0 m-auto -rotate-90"
          >
            <circle cx="14" cy="14" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} />
            <circle
              cx="14"
              cy="14"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - ring)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </svg>
        )}
        <CoffeeIcon awake={look.tone === "held"} />
        {look.text && (
          <span
            aria-hidden
            className={`text-[11px] font-semibold leading-none tabular-nums ${
              look.tone === "stopped" ? "text-[var(--accent-amber-text)]" : ""
            }`}
          >
            {look.text}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
