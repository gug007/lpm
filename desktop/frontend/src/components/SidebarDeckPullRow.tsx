import { pullDeck } from "../originActions";
import { isPlainPull, originMark } from "../originStatus";
import { useDeckPull } from "../store/deckPull";
import { useOriginStatus } from "../store/originStatus";
import { SpinnerIcon } from "./project-detail/icons";
import { deckKindLabel } from "./sidebarDeck";

export interface DeckPullTarget {
  root: string;
  name: string;
  worktree?: boolean;
  isParent: boolean;
}

const ROW_CLASS = "relative flex h-7 w-full items-center gap-1.5 rounded-md pr-3 text-left text-[12px] font-medium";

// The deck's last row while two or more of its projects only need a pull: one
// press pulls them all, then it reports how that went and steps away.
export function SidebarDeckPullRow({
  deck,
  parentLabel,
  targets,
  indented,
}: {
  deck: string;
  parentLabel: string;
  targets: DeckPullTarget[];
  indented: boolean;
}) {
  const entries = useOriginStatus((s) => s.entries);
  const pull = useDeckPull((s) => s.decks[deck]);
  // Text starts on the names above it: `px-3` plus the 8px dot and `gap-3`, or
  // the folder's 27px step in place of `px-3`.
  const pad = indented ? "pl-[47px]" : "pl-8";

  const pullable = targets.filter((target) => {
    const entry = entries[target.root];
    return !!entry && !entry.running && !entry.done && isPlainPull(originMark(entry.status));
  });

  if (pull?.running) {
    const now = Math.min(pull.done + 1, pull.total);
    return (
      <div role="status" className={`${ROW_CLASS} ${pad} text-[var(--text-muted)]`}>
        <SpinnerIcon />
        <span>
          Pulling {now} of {pull.total}
        </span>
        <span
          aria-hidden
          className={`absolute bottom-0.5 right-3 h-[2px] overflow-hidden rounded-full bg-[var(--bg-hover)] ${
            indented ? "left-[47px]" : "left-8"
          }`}
        >
          <span
            className="block h-full bg-[var(--accent-sky)] transition-[width] duration-300"
            style={{ width: `${(pull.done / pull.total) * 100}%` }}
          />
        </span>
      </div>
    );
  }

  if (pull && pull.failed.length === 0) {
    return (
      <div role="status" className={`${ROW_CLASS} ${pad} text-[var(--accent-green-text)]`}>
        ✓ {pull.total} pulled
      </div>
    );
  }

  const stuck = pull ? pullable.filter((target) => pull.failed.includes(target.root)) : [];
  if (stuck.length > 0) {
    return (
      <div className={`${ROW_CLASS} ${pad}`}>
        <span className="min-w-0 truncate text-[var(--accent-red-text)]">
          {stuck.length === 1 ? `${stuck[0].name} didn’t pull` : `${stuck.length} didn’t pull`}
        </span>
        <button
          type="button"
          onClick={() => void pullDeck(deck, targets)}
          className="shrink-0 rounded text-[var(--accent-sky-text)] outline-none hover:underline focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60"
        >
          Retry
        </button>
      </div>
    );
  }

  if (pullable.length < 2) return null;
  const copies = pullable.filter((target) => !target.isParent);
  const kind = deckKindLabel(copies);
  const label =
    copies.length < pullable.length
      ? `Pull ${parentLabel} and ${copies.length} ${kind}`
      : `Pull ${copies.length} ${kind}`;
  return (
    <button
      type="button"
      onClick={() => void pullDeck(deck, targets)}
      title={`Pull ${pullable.map((target) => target.name).join(", ")}`}
      className={`${ROW_CLASS} ${pad} text-[var(--accent-sky-text)] outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-cyan)]/60`}
    >
      ↓ {label}
    </button>
  );
}
