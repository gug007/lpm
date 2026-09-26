import type { ReactNode } from "react";
import { originActionLabel, originMark, originMarkTitle, type OriginMark } from "../originStatus";
import { useOriginStatus } from "../store/originStatus";
import { SpinnerIcon } from "./project-detail/icons";

const INCOMING = "text-[var(--accent-sky-text)]";
const QUIET = "text-[var(--text-muted)]";

function markText(mark: OriginMark): ReactNode {
  switch (mark.kind) {
    case "behind":
      return <span className={INCOMING}>↓{mark.behind}</span>;
    case "diverged":
      return (
        <>
          <span className={`${QUIET} mr-1.5`}>↑{mark.ahead}</span>
          <span className={INCOMING}>↓{mark.behind}</span>
        </>
      );
    case "base":
      return mark.onBase ? (
        <span className={INCOMING}>↓{mark.behind}</span>
      ) : (
        <>
          <span className={`${QUIET} mr-1`}>{mark.base}</span>
          <span className={INCOMING}>+{mark.behind}</span>
        </>
      );
    case "conflict":
      return <span className="text-[var(--accent-red-text)]">Conflict</span>;
  }
}

// The end of a project row when its branch on origin has moved on: "↓3" at rest.
// On hover it steps aside for SidebarOriginAction, keeping an invisible copy of
// that button's label so the name truncates to make room for it.
export function SidebarOriginMark({ root }: { root: string }) {
  const entry = useOriginStatus((s) => s.entries[root]);
  if (!entry) return null;
  if (entry.running) {
    return (
      <span className={`ml-auto flex shrink-0 items-center ${QUIET}`} title="Catching up with origin…">
        <SpinnerIcon />
      </span>
    );
  }
  if (entry.done) {
    return (
      <span className="ml-auto shrink-0 text-[11px] font-medium text-[var(--accent-green-text)]">
        ✓ {entry.done}
      </span>
    );
  }
  const mark = originMark(entry.status);
  if (!mark) return null;
  return (
    <span
      className="ml-auto flex shrink-0 items-center text-[11px] font-medium tabular-nums"
      title={originMarkTitle(mark, entry.status.branch)}
    >
      <span className="flex items-center group-hover:hidden">
        {markText(mark)}
      </span>
      <span aria-hidden="true" className="invisible hidden px-2 group-hover:inline">
        {originActionLabel(mark)}
      </span>
    </span>
  );
}
