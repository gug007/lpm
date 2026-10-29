import { useState } from "react";
import { moveFile, readyToCommit, withMessage } from "../commitSplit";
import { count } from "../count";
import { useOutsideClick } from "../hooks/useOutsideClick";
import type { CommitSplit } from "../hooks/useCommitSplit";
import { ChevronDownIcon, XIcon } from "./icons";

interface CommitSplitViewProps {
  split: CommitSplit;
  onClose: () => void;
  onDone: () => void;
}

/** The commit dialog once the changes are split: each commit's message,
 *  editable, and its files, which can move between commits. They are made in
 *  the order listed. */
export function CommitSplitView({ split, onClose, onDone }: CommitSplitViewProps) {
  const groups = split.groups ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false), menuOpen);
  const busy = split.busy !== false;
  const canCommit = !busy && readyToCommit(groups);
  const label = `Commit ${groups.length}`;

  const commit = async (andPush: boolean) => {
    setMenuOpen(false);
    if (await split.commitAll(andPush)) onDone();
  };

  return (
    <>
      <div data-modal-drag-handle className="flex items-center justify-between px-5 pb-3 pt-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Commit in Parts</h3>
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-4">
        <p className="text-xs text-[var(--text-muted)]">
          {count(groups.length, "commit", "commits")}, made in this order. Edit a message or move a file to another commit.
        </p>
        {groups.map((group, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="flex items-start gap-2 px-3 pt-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--bg-active)] text-[10px] font-medium tabular-nums text-[var(--text-secondary)]">
                {i + 1}
              </span>
              <textarea
                value={group.message}
                onChange={(e) => split.setGroups(withMessage(groups, i, e.target.value))}
                aria-label={`Message for commit ${i + 1}`}
                placeholder="Describe this commit..."
                disabled={busy}
                rows={Math.min(4, Math.max(1, group.message.split("\n").length))}
                spellCheck={false}
                className="min-w-0 flex-1 resize-none bg-transparent font-mono text-[12.5px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
              />
            </div>
            <ul className="mt-2 flex flex-col border-t border-[var(--border)]/70 py-1">
              {group.files.map((file) => (
                <li key={file} className="flex items-center gap-2 px-3 py-0.5 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]" title={file}>
                    {file}
                  </span>
                  <select
                    value={i}
                    disabled={busy}
                    aria-label={`Commit for ${file}`}
                    onChange={(e) => split.setGroups(moveFile(groups, file, Number(e.target.value)))}
                    className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[11px] text-[var(--text-secondary)] outline-none hover:border-[var(--text-muted)]/50 disabled:opacity-50"
                  >
                    {groups.map((_, j) => (
                      <option key={j} value={j}>
                        Commit {j + 1}
                      </option>
                    ))}
                    <option value={groups.length}>New commit</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          onClick={() => split.setGroups(null)}
          disabled={busy}
          className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          Back
        </button>
        <div ref={menuRef} className="relative flex">
          <button
            onClick={() => void commit(false)}
            disabled={!canCommit}
            className="rounded-l-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
          >
            {split.busy === "push" ? "Pushing..." : split.busy === "commit" ? "Committing..." : label}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={!canCommit}
            aria-label="More ways to commit"
            className="rounded-r-lg border-l border-[var(--bg-primary)]/20 bg-[var(--text-primary)] px-1.5 py-1.5 text-[var(--bg-primary)]/70 transition-all hover:text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-30"
          >
            <ChevronDownIcon />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 z-10 mb-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
              {(
                [
                  { text: label, push: false },
                  { text: `${label} and Push`, push: true },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.text}
                  onClick={() => void commit(opt.push)}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  {opt.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
