import type { PullRequestInfo } from "../types";
import { DrillMenu } from "./DrillMenu";
import { PullSplitRow, pullConfigScreen } from "./pullMenu";
import { PushSplitRow, pushConfigScreen } from "./pushMenu";
import { FetchSplitRow, fetchConfigScreen } from "./fetchMenu";
import { HistoryIcon, MergeIcon, PRIcon, SparkleIcon, UndoIcon } from "./icons";

interface CommitActionsMenuProps {
  busy: boolean;
  uncommitted: number;
  openPr: PullRequestInfo | null;
  showAI: boolean;
  onPull: () => void;
  onPush: () => void;
  onFetch: () => void;
  onPullRequest: () => void;
  onMerge: () => void;
  onHistory: () => void;
  onAutoCommit: (andPush: boolean) => void;
  onAutoPR: () => void;
  onDiscardAll: () => void;
  onClose: () => void;
}

export function CommitActionsMenu({
  busy,
  uncommitted,
  openPr,
  showAI,
  onPull,
  onPush,
  onFetch,
  onPullRequest,
  onMerge,
  onHistory,
  onAutoCommit,
  onAutoPR,
  onDiscardAll,
  onClose,
}: CommitActionsMenuProps) {
  return (
    <DrillMenu
      widthClassName="w-full"
      showClose={false}
      root={{
        render: (api) => (
          <>
            <PullSplitRow
              busy={busy}
              onRun={onPull}
              onConfigure={() =>
                api.push(
                  pullConfigScreen({ busy, onRun: onPull }),
                )
              }
            />
            <PushSplitRow
              busy={busy}
              onRun={onPush}
              onConfigure={() =>
                api.push(
                  pushConfigScreen({ busy, onRun: onPush }),
                )
              }
            />
            <FetchSplitRow
              busy={busy}
              onRun={onFetch}
              onConfigure={() =>
                api.push(
                  fetchConfigScreen({ busy, onRun: onFetch }),
                )
              }
            />
            <button
              onClick={onPullRequest}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PRIcon />
              {openPr ? `Open PR #${openPr.number}` : "Create PR"}
            </button>
            <button
              onClick={onMerge}
              disabled={busy}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MergeIcon />
              Merge
            </button>
            <button
              onClick={onHistory}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              <HistoryIcon />
              History
            </button>
            {showAI && (
              <>
                <div className="my-1.5 border-t border-[var(--border)]" />
                <button
                  onClick={() => onAutoCommit(false)}
                  disabled={uncommitted === 0}
                  className="group flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="mt-0.5 text-[var(--text-secondary)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                    <SparkleIcon />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                      Auto Commit
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      AI writes the message, then commits
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onAutoCommit(true)}
                  disabled={uncommitted === 0}
                  className="group flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="mt-0.5 text-[var(--text-secondary)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                    <SparkleIcon />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                      Auto Commit and Push
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      AI writes the message, commits, and pushes
                    </span>
                  </span>
                </button>
                {!openPr && (
                  <button
                    onClick={onAutoPR}
                    disabled={busy}
                    className="group flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="mt-0.5 text-[var(--text-secondary)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <SparkleIcon />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                        Auto Create PR
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        AI names the branch, commits, pushes, and opens the PR
                      </span>
                    </span>
                  </button>
                )}
              </>
            )}
            <div className="my-1.5 border-t border-[var(--border)]" />
            <button
              onClick={onDiscardAll}
              disabled={uncommitted === 0}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UndoIcon />
              Discard all changes
            </button>
          </>
        ),
      }}
      onClose={onClose}
    />
  );
}
