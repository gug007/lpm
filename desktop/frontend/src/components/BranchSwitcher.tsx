import { useRef, useState } from "react";
import { toast } from "../notifications/toast";
import {
  CheckoutBranch,
  CreateBranch,
  DeleteBranch,
  DeleteRemoteTrackingRef,
  GenerateCommitMessage,
  GitChangedFiles,
  GitDiscardAll,
  GitFetchAll,
  GitPruneRemotes,
  GitPush,
  PullBranch,
  RenameBranch,
} from "../../bridge/commands";
import { getSettings } from "../store/settings";
import { aiEffectiveEffort, aiEffectiveFast, type PullRequestInfo } from "../types";
import { runAutoCommit } from "../autoCommit";
import { useAIPicker } from "../hooks/useAIPicker";
import {
  DEFAULT_PULL_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_FETCH_CONFIG,
  pullFlags,
  pushFlags,
  fetchFlags,
  type GitPullConfig,
  type GitPushConfig,
  type GitFetchConfig,
} from "../gitOptions";
import { DrillMenu } from "./DrillMenu";
import { PullSplitRow, pullConfigScreen } from "./pullMenu";
import { PushSplitRow, pushConfigScreen } from "./pushMenu";
import { FetchSplitRow, fetchConfigScreen } from "./fetchMenu";
import { main } from "../../bridge/models";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useEventListener } from "../hooks/useEventListener";
import type { useGitStatus } from "../hooks/useGitStatus";
import { CreateBranchModal } from "./CreateBranchModal";
import { CommitModal } from "./CommitModal";
import { LineCounts } from "./LineCounts";
import { AutoPRModal, type AutoPRAIParams } from "./AutoPRModal";
import { MergeBranchDialog } from "./MergeBranchDialog";
import { PRModal } from "./PRModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { BranchIcon, ChevronDownIcon, SparkleIcon, UndoIcon, UploadIcon } from "./icons";
import { BranchSearchMenu } from "./BranchSearchMenu";
import { isUnpublished } from "./branchUtils";
import { shouldFetch, recordFetch } from "../gitFetchThrottle";
import { toastPullError } from "../gitPullErrors";
import { pulledText, pushedText, syncedText } from "../gitToastText";
import { middleTruncate } from "../middleTruncate";

// What fits the footer label in the 11px monospace face; the label is never
// clipped again, or the "…" glyph's extra width cuts off the branch's end.
const BRANCH_LABEL_MAX = 19;

export function BranchSwitcher({
  projectName,
  projectPath,
  gitState,
  pullRequest = null,
}: {
  projectName: string;
  projectPath: string;
  gitState: ReturnType<typeof useGitStatus>;
  pullRequest?: PullRequestInfo | null;
}) {
  const openPr = pullRequest?.state === "OPEN" ? pullRequest : null;
  const { status, branches, diffStat, refresh } = gitState;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createPrefill, setCreatePrefill] = useState("");
  const [committing, setCommitting] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [autoPR, setAutoPR] = useState<AutoPRAIParams | null>(null);
  const [merging, setMerging] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState<main.Branch | null>(
    null,
  );
  const [removingRemote, setRemovingRemote] = useState<main.Branch | null>(
    null,
  );
  const [pruning, setPruning] = useState(false);
  const pruningRef = useRef(false);
  const ai = useAIPicker(commitMenuOpen, projectName);

  const commitMenuRef = useOutsideClick<HTMLDivElement>(
    () => setCommitMenuOpen(false),
    commitMenuOpen,
  );

  const ref = useOutsideClick<HTMLDivElement>(() => {
    setOpen(false);
  }, open && !creating);

  useEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") setOpen(false);
    },
    document,
    open && !creating,
  );

  if (!status?.isGitRepo) return null;

  const checkout = async (branch: main.Branch) => {
    if (busy || branch.name === status.branch) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await CheckoutBranch(projectPath, branch.name, branch.remote ?? "");
      await refresh();
      setOpen(false);
    } catch (err) {
      toast.error(`Checkout ${branch.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async (name: string, from?: string) => {
    if (!name || busy) return;
    setBusy(true);
    try {
      await CreateBranch(projectPath, name, from);
      await refresh();
      setOpen(false);
      setCreating(false);
    } catch (err) {
      toast.error(`Create ${name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  // Deleted-on-remote branches leave stale remote-tracking refs that a plain
  // fetch never removes, so they linger in the list (as cloud entries) until a
  // prune. Kick off a throttled, non-blocking `fetch --prune` when the picker
  // opens; the list re-renders from local refs immediately and updates when the
  // prune lands. Offline/no-remote just no-ops via the swallowed error.
  const maybePrune = () => {
    if (pruningRef.current || !shouldFetch(projectPath)) return;
    pruningRef.current = true;
    recordFetch(projectPath);
    setPruning(true);
    GitPruneRemotes(projectPath)
      .then(() => refresh())
      .catch(() => {})
      .finally(() => {
        pruningRef.current = false;
        setPruning(false);
      });
  };

  const toggleOpen = () => {
    if (!open) {
      refresh();
      maybePrune();
    }
    setOpen(!open);
  };

  const runPull = async (cfg: GitPullConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    const { behind, branch } = status;
    try {
      await PullBranch(projectPath, cfg.strategy, pullFlags(cfg));
      await refresh();
      toast.success(pulledText(behind, branch));
    } catch (err) {
      toastPullError(err, {
        label: "Couldn't pull",
        retry: () => void runPull(cfg),
        retryWithAutostash: () => void runPull({ ...cfg, autostash: true }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const runPullDefault = () =>
    runPull(getSettings().gitPull ?? DEFAULT_PULL_CONFIG);

  const runPush = async (cfg: GitPushConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    const { ahead, branch } = status;
    try {
      await GitPush(projectPath, pushFlags(cfg));
      await refresh();
      toast.success(pushedText(ahead, branch));
    } catch (err) {
      toast.error(`Couldn't push: ${err}`, { retry: () => void runPush(cfg) });
    } finally {
      setBusy(false);
    }
  };

  const runPushDefault = () =>
    runPush(getSettings().gitPush ?? DEFAULT_PUSH_CONFIG);

  const runFetch = async (cfg: GitFetchConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    try {
      await GitFetchAll(projectPath, fetchFlags(cfg));
      await refresh();
      toast.success("Fetched");
    } catch (err) {
      toast.error(`Couldn't fetch: ${err}`, { retry: () => void runFetch(cfg) });
    } finally {
      setBusy(false);
    }
  };

  const runFetchDefault = () =>
    runFetch(getSettings().gitFetch ?? DEFAULT_FETCH_CONFIG);

  const aiParams = (): AutoPRAIParams => ({
    cli: ai.selectedCLI,
    model: ai.selectedModel,
    effort: aiEffectiveEffort(
      ai.selectedCLI,
      ai.selectedModel,
      ai.selectedEffort,
    ),
    fast: aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
  });

  const startAutoPR = () => {
    setCommitMenuOpen(false);
    setAutoPR(aiParams());
  };

  const runAuto = async (andPush: boolean) => {
    setCommitMenuOpen(false);
    const { cli, model, effort, fast } = aiParams();
    let paths: string[];
    try {
      const files = await GitChangedFiles(projectPath);
      paths = (files || []).map((f: main.ChangedFile) => f.path);
    } catch (err) {
      toast.error(`${projectName}: auto commit failed: ${err}`);
      return;
    }
    if (paths.length === 0) return;
    await runAutoCommit({
      projectName,
      projectPath,
      paths,
      andPush,
      generate: () =>
        GenerateCommitMessage(
          projectName,
          projectPath,
          cli,
          model,
          effort,
          fast,
          paths,
          "",
          crypto.randomUUID(),
        ),
    });
    refresh();
  };

  const runSync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pull = getSettings().gitPull ?? DEFAULT_PULL_CONFIG;
      const push = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
      const { behind, ahead, branch } = status;
      await PullBranch(projectPath, pull.strategy, pullFlags(pull));
      await GitPush(projectPath, pushFlags(push));
      await refresh();
      toast.success(syncedText(behind, ahead, branch));
    } catch (err) {
      toast.error(`Couldn't sync: ${err}`, { retry: () => void runSync() });
    } finally {
      setBusy(false);
    }
  };

  const syncToolbarAction = () => {
    if (status.behind > 0 && status.ahead > 0) return runSync();
    if (status.behind > 0) return runPullDefault();
    return runPushDefault();
  };

  const handleDiscardAll = async () => {
    setDiscarding(true);
    try {
      await GitDiscardAll(projectPath);
      toast.success("Discarded all changes");
      refresh();
    } catch (err) {
      toast.error(`Discard failed: ${err}`);
    } finally {
      setDiscarding(false);
      setConfirmDiscardAllOpen(false);
    }
  };

  const renameBranch = async (b: main.Branch, newName: string) => {
    setBusy(true);
    try {
      await RenameBranch(projectPath, b.name, newName);
      await refresh();
      return true;
    } catch (err) {
      toast.error(`Rename ${b.name}: ${err}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyBranchName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      return true;
    } catch {
      toast.error("Copy failed");
      return false;
    }
  };

  const handleDelete = async () => {
    const b = deletingBranch;
    if (!b) return;
    setBusy(true);
    try {
      await DeleteBranch(projectPath, b.name);
      await refresh();
      setDeletingBranch(null);
    } catch (err) {
      toast.error(`Delete ${b.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveRemote = async () => {
    const b = removingRemote;
    if (!b || !b.remote) return;
    setBusy(true);
    try {
      await DeleteRemoteTrackingRef(projectPath, b.remote, b.name);
      await refresh();
      setRemovingRemote(null);
    } catch (err) {
      toast.error(`Remove ${b.remote}/${b.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const needsSync =
    status.hasUpstream && (status.ahead > 0 || status.behind > 0);
  const unpublished = isUnpublished(status);

  return (
    <div className="flex items-center gap-1">
      {unpublished && (
        <button
          onClick={runPushDefault}
          disabled={busy}
          title={busy ? "Pushing…" : "Push this branch to the remote for the first time"}
          className="flex items-center gap-1 rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? <SyncIcon spinning /> : <UploadIcon size={12} />}
          Publish
        </button>
      )}
      {needsSync && (
        <button
          onClick={syncToolbarAction}
          disabled={busy}
          title={
            busy ? "Syncing…" : `Pull ${status.behind}, push ${status.ahead}`
          }
          className="flex items-center gap-1 rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97] disabled:opacity-40"
        >
          <SyncIcon spinning={busy} />
          {status.behind > 0 && (
            <span className="tabular-nums">{status.behind}↓</span>
          )}
          {status.ahead > 0 && (
            <span className="tabular-nums">{status.ahead}↑</span>
          )}
        </button>
      )}
      <div ref={ref} className="relative">
        <button
          onClick={toggleOpen}
          title={busy ? "Switching branch…" : "Switch branch"}
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
            title={status.branch.length > BRANCH_LABEL_MAX ? status.branch : undefined}
          >
            {status.branch ? middleTruncate(status.branch, BRANCH_LABEL_MAX) : "detached"}
          </span>
          <ChevronDownIcon />
        </button>

        {open && (
          <BranchSearchMenu
            projectPath={projectPath}
            branches={branches}
            current={status.branch}
            uncommitted={status.uncommitted}
            busy={busy}
            pruning={pruning}
            onCheckout={checkout}
            onCreate={create}
            onRename={renameBranch}
            onDelete={setDeletingBranch}
            onRemoveRemote={setRemovingRemote}
            onCopyName={copyBranchName}
            onNewBranch={(prefill) => {
              setCreatePrefill(prefill);
              setOpen(false);
              setCreating(true);
            }}
          />
        )}
      </div>
      <div
        ref={commitMenuRef}
        className="relative flex rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)]"
      >
        <button
          onClick={() => setCommitting(true)}
          disabled={busy || status.uncommitted === 0}
          title={
            status.uncommitted > 0 ? "Commit changes" : "No changes to commit"
          }
          className="flex items-center gap-1 rounded-l-md px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CommitIcon />
          <span>Commit</span>
          {status.uncommitted > 0 &&
            (diffStat && diffStat.linesAdded + diffStat.linesRemoved > 0 ? (
              <LineCounts
                added={diffStat.linesAdded}
                removed={diffStat.linesRemoved}
                className="ml-0.5"
              />
            ) : (
              <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
            ))}
        </button>
        <button
          onClick={() => setCommitMenuOpen(!commitMenuOpen)}
          disabled={busy}
          className={`flex items-center rounded-r-md border-l border-[var(--composer-border)] px-1.5 py-1 transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97] disabled:opacity-40 ${
            commitMenuOpen
              ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]"
              : "text-[var(--composer-fg-secondary)]"
          }`}
        >
          <ChevronDownIcon />
        </button>
        {commitMenuOpen && (
          <div data-row-menu="off" className="absolute bottom-full right-0 z-10 mb-2">
            <DrillMenu
              widthClassName="w-80"
              showClose={false}
              root={{
                render: (api) => (
                  <>
                    <PullSplitRow
                      busy={busy}
                      onRun={runPullDefault}
                      onConfigure={() =>
                        api.push(
                          pullConfigScreen({ busy, onRun: runPullDefault }),
                        )
                      }
                    />
                    <PushSplitRow
                      busy={busy}
                      onRun={runPushDefault}
                      onConfigure={() =>
                        api.push(
                          pushConfigScreen({ busy, onRun: runPushDefault }),
                        )
                      }
                    />
                    <FetchSplitRow
                      busy={busy}
                      onRun={runFetchDefault}
                      onConfigure={() =>
                        api.push(
                          fetchConfigScreen({ busy, onRun: runFetchDefault }),
                        )
                      }
                    />
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        if (openPr) BrowserOpenURL(openPr.url);
                        else setCreatingPR(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      <PRMenuIcon />
                      {openPr ? `Open PR #${openPr.number}` : "Create PR"}
                    </button>
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setMerging(true);
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <MergeMenuIcon />
                      Merge
                    </button>
                    {ai.anyAvailable && (
                      <>
                        <div className="my-1.5 border-t border-[var(--border)]" />
                        <button
                          onClick={() => runAuto(false)}
                          disabled={status.uncommitted === 0}
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
                          onClick={() => runAuto(true)}
                          disabled={status.uncommitted === 0}
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
                            onClick={startAutoPR}
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
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setConfirmDiscardAllOpen(true);
                      }}
                      disabled={status.uncommitted === 0}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <UndoIcon />
                      Discard all changes
                    </button>
                  </>
                ),
              }}
              onClose={() => setCommitMenuOpen(false)}
            />
          </div>
        )}
      </div>
      <CreateBranchModal
        open={creating}
        busy={busy}
        projectName={projectName}
        projectPath={projectPath}
        status={status}
        branches={branches}
        initialName={createPrefill}
        onClose={() => setCreating(false)}
        onCreate={create}
        onSwitch={(branch) => {
          setCreating(false);
          void checkout(branch);
        }}
      />
      <CommitModal
        open={committing}
        projectName={projectName}
        projectPath={projectPath}
        onClose={() => setCommitting(false)}
        onCommitted={refresh}
      />
      <PRModal
        open={creatingPR}
        projectName={projectName}
        projectPath={projectPath}
        currentBranch={status.branch}
        onClose={() => setCreatingPR(false)}
        onCreated={refresh}
      />
      <AutoPRModal
        open={autoPR !== null}
        projectName={projectName}
        projectPath={projectPath}
        ai={autoPR}
        onClose={() => setAutoPR(null)}
        onChanged={refresh}
      />
      <MergeBranchDialog
        open={merging}
        projectName={projectName}
        projectPath={projectPath}
        currentBranch={status.branch}
        branches={branches}
        onClose={() => setMerging(false)}
        onMerged={refresh}
      />
      <ConfirmDialog
        open={confirmDiscardAllOpen}
        title="Discard all changes"
        variant="destructive"
        confirmLabel="Discard all"
        disabled={discarding}
        body={
          <>
            Reset the working tree to HEAD, discarding every uncommitted change
            (staged, unstaged, and untracked). This cannot be undone.
          </>
        }
        onCancel={() => setConfirmDiscardAllOpen(false)}
        onConfirm={handleDiscardAll}
      />
      <ConfirmDialog
        open={deletingBranch !== null}
        title="Delete branch"
        variant="destructive"
        confirmLabel="Delete"
        disabled={busy}
        body={
          <>
            Delete local branch{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {deletingBranch?.name}
            </span>
            ? This removes it even if it has unmerged commits.
          </>
        }
        onCancel={() => setDeletingBranch(null)}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={removingRemote !== null}
        title="Remove branch from list"
        confirmLabel="Remove"
        disabled={busy}
        body={
          <>
            Remove{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {removingRemote?.remote}/{removingRemote?.name}
            </span>
            ? This clears the copy lpm keeps locally — it doesn&apos;t change
            anything on the remote. If the branch still exists there, it will
            come back the next time you fetch.
          </>
        }
        onCancel={() => setRemovingRemote(null)}
        onConfirm={handleRemoveRemote}
      />
    </div>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function CommitIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function PRMenuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function MergeMenuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M6 9v6" />
      <path d="M6 21a12 12 0 0 0 12-12" />
    </svg>
  );
}
