import type { KeepAwakeMachine } from "../keepAwakeMachines";

// The computers at the top of the footer's Keep awake menu. An amber dot marks
// each one being kept awake right now.
export function KeepAwakeMachineTabs({
  machines,
  picked,
  onPick,
}: {
  machines: KeepAwakeMachine[];
  picked: string | null;
  onPick: (slug: string | null) => void;
}) {
  return (
    <div role="tablist" aria-label="Computers" className="flex flex-wrap gap-1 px-3 pb-0.5 pt-2">
      {machines.map((m) => {
        const selected = m.slug === picked;
        const awake = m.reading?.state.active === true;
        return (
          <button
            key={m.slug ?? ""}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onPick(m.slug)}
            className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60 ${
              selected
                ? "border-[var(--border)] bg-[var(--bg-active)] font-semibold text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${awake ? "bg-[var(--accent-amber)]" : "bg-[var(--text-muted)]/40"}`}
            />
            <span className="truncate">{m.name}</span>
            {awake && <span className="sr-only">, kept awake</span>}
          </button>
        );
      })}
    </div>
  );
}
