export const BTN_PRIMARY =
  "rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-40";
export const BTN_SECONDARY =
  "rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50";
export const BTN_SECONDARY_SM =
  "rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50";

export const TEXT_ACTION =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

export const ICON_ACTION =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

export const ICON_ACTION_DANGER = `${ICON_ACTION} hover:text-[var(--accent-red)]!`;
