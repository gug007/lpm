import { Timer } from "lucide-react";

const WHAT = "Closes when its agent is done";

export function CloseWhenDoneMark() {
  return (
    <span title={WHAT} aria-label={WHAT} className="ml-1 flex shrink-0 items-center text-[var(--text-muted)]">
      <Timer size={11} strokeWidth={1.75} />
    </span>
  );
}
