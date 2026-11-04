import { commitCiLabel, type CommitCiMark } from "../commitCi";
import { checkStateIcon } from "./ChecksButton";

/** A commit's CI result as an icon, or the arrow for one not pushed yet. */
export function CommitCiIcon({ mark, size = 12 }: { mark: CommitCiMark | null; size?: number }) {
  if (!mark) return null;
  const label = commitCiLabel(mark);
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0 items-center">
      {mark === "unpushed" ? (
        <span style={{ fontSize: size - 1 }} className="leading-none text-[var(--accent-cyan)]">
          ↑
        </span>
      ) : (
        checkStateIcon(mark, size)
      )}
    </span>
  );
}
