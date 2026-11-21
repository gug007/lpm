// The Keep awake menu's small controls, shared by its parts. They stay gray,
// the picked chip included, so amber is left for what is live: hover
// lightens, and keyboard focus gets the menu's cyan ring.
const CHIP =
  "rounded-full border py-0.5 text-[10.5px] tabular-nums outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60";
export const KA_CHIP = `${CHIP} px-2`;
// For a row that has to fit a label and four chips.
export const KA_CHIP_SNUG = `${CHIP} px-1.5`;
export const KA_CHIP_OFF =
  "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
export const KA_CHIP_ON = "border-[var(--text-muted)] bg-[var(--bg-active)] font-semibold text-[var(--text-primary)]";
export const KA_FIELD =
  "rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent-amber)]";
export const KA_LINK =
  "rounded px-1.5 py-0.5 text-[11px] outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]";
