import { relativeAgo } from "../relativeTime";
import { useSecondsClock } from "../hooks/useSecondsClock";

// How old a popup's data is, kept current on its own so the clock's tick
// re-renders this label and not the card around it.
export function PopupAge({ updatedAt }: { updatedAt: number }) {
  useSecondsClock();
  return (
    <span className="shrink-0 text-[11px] text-[var(--text-muted)]" title="When this data was made">
      {relativeAgo(Math.floor(updatedAt / 1000))}
    </span>
  );
}
