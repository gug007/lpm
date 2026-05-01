/** Shared visual tokens for the small modal-style forms (Clone, SSH). */

export const modalInputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60";

export const modalErrorInputClass = "border-[var(--danger,#f87171)]";

export const modalInputDefaults = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;
