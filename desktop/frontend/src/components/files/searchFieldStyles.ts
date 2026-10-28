// The rail's fields share one look: the file filter box, and the Search
// view's query, replacement and file filters.
export function fieldInputClass(invalid: boolean): string {
  return `h-7 w-full rounded-md border bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] ${
    invalid ? "border-[var(--accent-red)]" : "border-[var(--border)] focus:border-[var(--accent-cyan)]"
  }`;
}

export function sideButtonClass(active = false): string {
  return `relative flex h-7 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent ${
    active
      ? "text-[var(--accent-cyan)]"
      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:hover:text-[var(--text-muted)]"
  }`;
}

export const FIELD_ERROR = "break-words pt-1 text-[10.5px] text-[var(--accent-red-text)]";

export const TEXT_INPUT = {
  type: "text",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  "data-text-scope": "",
} as const;
