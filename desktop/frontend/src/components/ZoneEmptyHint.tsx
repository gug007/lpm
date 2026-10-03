import type { ZoneDisplay } from "../types";

const HINT_TONE: Record<ZoneDisplay, string> = {
  header: "text-[var(--text-muted)]",
  footer: "text-[var(--composer-fg-muted)]",
};

export function ZoneEmptyHint({ display = "header" }: { display?: ZoneDisplay }) {
  return (
    <span
      className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] ${HINT_TONE[display]}`}
    >
      Drop buttons here
    </span>
  );
}
