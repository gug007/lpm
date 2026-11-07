import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { main } from "../../bridge/models";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useEventListener } from "../hooks/useEventListener";
import type { useGitStatus } from "../hooks/useGitStatus";
import { CreateBranchModal } from "./CreateBranchModal";
import { CommitModal } from "./CommitModal";
import { LineCounts } from "./LineCounts";
import { AutoPRModal, type AutoPRAIParams } from "./AutoPRModal";
import { MergeBranchDialog } from "./MergeBranchDialog";
import { PRModal } from "./PRModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { ChevronDownIcon, UploadIcon } from "./icons";
import { CommitHistoryModal } from "./history/CommitHistoryModal";
import { BranchButton } from "./BranchButton";
import { useRecentCommits } from "../hooks/useRecentCommits";
import { useOverlay } from "../store/overlay";
import { BranchSearchMenu } from "./BranchSearchMenu";
import { CommitActionsMenu } from "./CommitActionsMenu";
import { isUnpublished } from "./branchUtils";
import { shouldFetch, recordFetch } from "../gitFetchThrottle";
import { toastPullError } from "../gitPullErrors";
import { DISCARD_KEPT_TEXT, announceDiscard } from "../gitDiscardUndo";
import { pulledText, pushedText, syncedText } from "../gitToastText";

const BRANCH_MENU_WIDTH = 520;
const COMMIT_MENU_WIDTH = 320;

export function BranchSwitcher({
  projectName,
  projectPath,
  gitState,
  pullRequest = null,
  active = true,
}: {
  projectName: string;
  projectPath: string;
  gitState: ReturnType<typeof useGitStatus>;
  pullRequest?: PullRequestInfo | null;
  active?: boolean;
}) {
  const openPr = pullRequest?.state === "OPEN" ? pullRequest : null;
  const { status, branches, diffStat, refresh } = gitState;
  const recentCommits = useRecentCommits(projectPath, active);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createPrefill, setCreatePrefill] = useState("");
  const [committing, setCommitting] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [autoPR, setAutoPR] = useState<AutoPRAIParams | null>(null);
  const [merging, setMerging] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
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

  const branchMenu = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: BRANCH_MENU_WIDTH,
    side: "above",
  });
  const commitMenu = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open: commitMenuOpen,
    onClose: () => setCommitMenuOpen(false),
    width: COMMIT_MENU_WIDTH,
    side: "above",
  });
  useOverlay(open || commitMenuOpen);

  // On <body>, the menus would outlive a pane hidden by switching project.
  useEffect(() => {
    if (active) return;
    setOpen(false);
    setCommitMenuOpen(false);
  }, [active]);

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
      const kept = await GitDiscardAll(projectPath);
      announceDiscard(projectPath, kept, "Discarded all changes", refresh);
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
      <div ref={branchMenu.triggerRef}>
        <BranchButton
          branch={status.branch}
          open={open}
          busy={busy}
          onToggle={toggleOpen}
          commits={recentCommits}
        />

        {open &&
          branchMenu.style &&
          createPortal(
            <div ref={branchMenu.panelRef} style={branchMenu.style} className="z-50">
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
            </div>,
            document.body,
          )}
      </div>
      <div
        ref={commitMenu.triggerRef}
        className="flex rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)]"
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
        {commitMenuOpen &&
          commitMenu.style &&
          createPortal(
            <div ref={commitMenu.panelRef} style={commitMenu.style} className="z-50">
              <CommitActionsMenu
                busy={busy}
                uncommitted={status.uncommitted}
                openPr={openPr}
                showAI={ai.anyAvailable}
                onPull={runPullDefault}
                onPush={runPushDefault}
                onFetch={runFetchDefault}
                onPullRequest={() => {
                  setCommitMenuOpen(false);
                  if (openPr) BrowserOpenURL(openPr.url);
                  else setCreatingPR(true);
                }}
                onMerge={() => {
                  setCommitMenuOpen(false);
                  setMerging(true);
                }}
                onHistory={() => {
                  setCommitMenuOpen(false);
                  setShowingHistory(true);
                }}
                onAutoCommit={runAuto}
                onAutoPR={startAutoPR}
                onDiscardAll={() => {
                  setCommitMenuOpen(false);
                  setConfirmDiscardAllOpen(true);
                }}
                onClose={() => setCommitMenuOpen(false)}
              />
            </div>,
            document.body,
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
      <CommitHistoryModal
        open={showingHistory}
        projectPath={projectPath}
        branch={status.branch}
        onClose={() => setShowingHistory(false)}
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
            (staged, unstaged, and untracked). {DISCARD_KEPT_TEXT}
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
