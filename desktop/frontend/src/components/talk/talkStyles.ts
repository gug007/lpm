const FOCUS_RING = "outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]";

// A row's title that opens a menu: "In", "Duplicate" or "Worktree".
export const TALK_TITLE_MENU = `inline-flex items-center gap-0.5 rounded text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] ${FOCUS_RING}`;

// A row's value that opens a menu: the project or the agent, boxed like the prompt field.
export const TALK_VALUE_MENU = `inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] ${FOCUS_RING}`;

export const TALK_QUIET_ACTION = `inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`;

export const TALK_KEYCAP = "rounded border border-[var(--border)] px-1 text-[10px] leading-[14px] text-[var(--text-muted)]";
