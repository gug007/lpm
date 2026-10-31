// The look shared by the tabs in the launchpad's row: their shape, the tone of
// a picked tab or not, and the hover an unpicked tab (or each half of a split)
// takes.
export const LAUNCHPAD_TAB =
  "flex h-7 items-center whitespace-nowrap rounded-lg text-[12px] font-medium transition-colors [&>svg]:h-[14px] [&>svg]:w-[14px]";

export const LAUNCHPAD_TAB_HOVER = "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

export function launchpadTabTone(checked: boolean): string {
  return checked ? "bg-[var(--composer-active-bg)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]";
}

// A heading over one of the launchpad's lists.
export const LAUNCHPAD_CAPTION = "text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";
