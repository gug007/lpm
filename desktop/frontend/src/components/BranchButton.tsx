import type { HistoryCommit } from "../gitHistory";
import { middleTruncate } from "../middleTruncate";
import { BranchCommitCard } from "./BranchCommitCard";
import { BranchIcon, ChevronDownIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

// What fits the footer label in the 11px monospace face; the label is never
// clipped again, or the "…" glyph's extra width cuts off the branch's end.
const BRANCH_LABEL_MAX = 19;
const COMMIT_CARD_DELAY_MS = 400;
const COMMIT_CARD_WIDTH = 368;

interface BranchButtonProps {
  branch: string;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  commits: HistoryCommit[];
}

/** The footer's branch button, with the last commits on a card while resting
 *  on it. */
export function BranchButton({ branch, open, busy, onToggle, commits }: BranchButtonProps) {
  return (
    <Tooltip
      side="top"
      align="end"
      wide
      interactive
      maxWidth={COMMIT_CARD_WIDTH}
      delay={COMMIT_CARD_DELAY_MS}
      disabled={open || busy || commits.length === 0}
      content={<BranchCommitCard commits={commits} />}
    >
      <button
        onClick={onToggle}
        aria-label="Switch branch"
        title={busy ? "Switching branch…" : undefined}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--composer-border)] px-2.5 py-1 text-[11px] font-medium transition-all duration-100 active:scale-[0.97] disabled:opacity-40 ${
          open
            ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]"
            : "bg-[var(--composer-surface)] text-[var(--composer-fg-secondary)] hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)]"
        }`}
      >
        <BranchIcon size={12} />
        <span
          className="whitespace-nowrap font-mono"
          title={branch.length > BRANCH_LABEL_MAX ? branch : undefined}
        >
          {branch ? middleTruncate(branch, BRANCH_LABEL_MAX) : "detached"}
        </span>
        <ChevronDownIcon />
      </button>
    </Tooltip>
  );
}
