// Shared input/textarea field styling so dialogs that compose their own fields
// (e.g. BulkDuplicateDialog, CopyRunConfig) stay visually consistent.
export const FIELD_CLASS =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]";

// A quiet, sentence-case label sitting to the left of a settings row's control.
export const SECTION_LABEL =
  "text-[13px] font-medium text-[var(--text-secondary)]";

// The single muted helper voice used under fields across the duplicate dialog.
export const HELPER_TEXT = "text-[12px] leading-snug text-[var(--text-muted)]";

// A grouped settings card: a soft, subtly-tinted panel that replaces the older
// full-bleed divider rules so related controls read as one unit. No
// `overflow-hidden` here — cards host popover menus (ActionPicker) that must be
// free to spill past the card edge.
export const CARD_CLASS =
  "rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40";
