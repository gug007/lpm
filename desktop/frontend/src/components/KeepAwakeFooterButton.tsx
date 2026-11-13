import { type KeepAwakeSession, useKeepAwakeLeft, useKeepAwakeSpan } from "../hooks/useKeepAwakeSession";
import { keepAwakeCupLabel } from "../keepAwake";
import { CoffeeIcon } from "./icons";
import { KeepAwakeHoverCard } from "./KeepAwakeHoverCard";
import { Tooltip } from "./ui/Tooltip";

const RING_RADIUS = 12.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// The footer's own button while this machine is kept awake and its row is
// folded into More, so the state isn't hidden behind a menu. A ring drains with
// a countdown and a count says how many agents hold it; resting on it shows the
// card with +1 h and Turn off, and a click opens the whole menu.
export function KeepAwakeFooterButton({
  session,
  menuOpen,
  onToggleMenu,
  className,
}: {
  session: KeepAwakeSession;
  menuOpen: boolean;
  onToggleMenu: (trigger: HTMLElement) => void;
  className: string;
}) {
  const { state, endsAt } = session;
  const left = useKeepAwakeLeft(endsAt);
  const total = useKeepAwakeSpan(endsAt);
  if (!state) return null;
  const holding = state.mode === "agents" ? state.agents : 0;
  const ring = left !== null && total !== null ? Math.min(1, left / total) : null;

  return (
    <Tooltip
      content={<KeepAwakeHoverCard session={session} />}
      side="top"
      wide
      interactive
      delay={150}
      triggerClassName="inline-flex shrink-0"
    >
      <button
        type="button"
        onClick={(e) => onToggleMenu(e.currentTarget)}
        aria-expanded={menuOpen}
        aria-label={`Keep awake: ${keepAwakeCupLabel(state, left)}`}
        className={`${className} relative text-[var(--accent-amber-text)] ${menuOpen ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"}`}
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
        <CoffeeIcon awake />
        {holding > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent-amber-text)] px-1 text-[9px] font-bold leading-none tabular-nums text-[var(--bg-primary)] ring-2 ring-[var(--bg-sidebar)]">
            {holding > 9 ? "9+" : holding}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
