import { useKeepAwakeLeft } from "../hooks/useKeepAwakeSession";
import { keepAwakeCupLabel, type KeepAwakeState } from "../keepAwake";

// One computer in the cup's card while several are kept awake: its name and
// what holds it, ticking while a countdown runs. A click opens its tab.
export function KeepAwakeMachineLine({
  name,
  state,
  endsAt,
  onOpen,
}: {
  name: string;
  state: KeepAwakeState;
  endsAt: number | null;
  onOpen: () => void;
}) {
  const left = useKeepAwakeLeft(endsAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.active ? "bg-[var(--accent-amber)]" : "bg-[var(--text-muted)]/40"}`}
      />
      <span className="min-w-0 truncate text-[var(--text-primary)]">{name}</span>
      <span className="ml-auto shrink-0 pl-2 text-[10.5px] tabular-nums text-[var(--text-muted)]">
        {keepAwakeCupLabel(state, left)}
      </span>
    </button>
  );
}
