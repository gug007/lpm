export const PORTS_GRID =
  "grid grid-cols-[4.5rem_minmax(7rem,1fr)_minmax(8rem,1.4fr)_minmax(6rem,0.8fr)_3rem_minmax(11rem,auto)] items-center gap-3";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

export const PORT_ACTION = `rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS}`;

export const PORT_DANGER = `rounded-md border border-[var(--accent-red)]/30 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-red-text)] transition-colors hover:bg-[var(--accent-red)]/10 ${FOCUS}`;
