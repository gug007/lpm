export const PORTS_GRID =
  "grid grid-cols-[4.5rem_minmax(7rem,1fr)_minmax(9rem,1.3fr)_minmax(6rem,0.8fr)_3.5rem_14rem] items-center gap-3";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

export const PORT_ACTION = `flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5 ${FOCUS}`;

export const PORT_DANGER = `flex h-7 items-center rounded-md border border-[var(--accent-red)]/30 px-2.5 text-[12px] font-medium text-[var(--accent-red-text)] transition-colors hover:bg-[var(--accent-red)]/10 ${FOCUS}`;
