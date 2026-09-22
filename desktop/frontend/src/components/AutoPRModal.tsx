import { useEffect, useRef, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { PRCreatedView } from "./PRCreatedView";
import { AutoPRStepList } from "./AutoPRStepList";
import {
  CreateBranch,
  CreatePullRequest,
  GenerateBranchName,
  GenerateCommitMessage,
  GeneratePRDescription,
  GeneratePRTitle,
  GitChangedFiles,
  GitCommit,
  GitDefaultBranch,
  GitPush,
  GitStatus,
} from "../../bridge/commands";
import { main } from "../../bridge/models";
import { EventsEmit } from "../../bridge/runtime";
import { getSettings } from "../store/settings";
import { rememberCreatedPr } from "../store/branchPr";
import { DEFAULT_PUSH_CONFIG, pushFlags } from "../gitOptions";
import { isCanceledError, useAIGeneration } from "../hooks/useAIGeneration";
import type { AICLI } from "../types";
import {
  AUTO_PR_STEP_IDS,
  nothingToSubmitReason,
  runAutoPR,
  type AutoPROps,
  type AutoPRRepoState,
  type AutoPRResult,
  type AutoPRStep,
  type AutoPRStepId,
  type AutoPRStepStatus,
} from "../autoPR";

export interface AutoPRAIParams {
  cli: AICLI;
  model: string;
  effort: string;
  fast: boolean;
}

interface AutoPRModalProps {
  open: boolean;
  projectName: string;
  projectPath: string;
  ai: AutoPRAIParams | null;
  onClose: () => void;
  onChanged: () => void;
}

type Phase = "running" | "done" | "failed" | "canceled";

const CANCELED = new Error("canceled");

function freshSteps(): Record<AutoPRStepId, AutoPRStep> {
  return {
    branch: { id: "branch", status: "pending" },
    commit: { id: "commit", status: "pending" },
    push: { id: "push", status: "pending" },
    pr: { id: "pr", status: "pending" },
  };
}

export function AutoPRModal({
  open,
  projectName,
  projectPath,
  ai,
  onClose,
  onChanged,
}: AutoPRModalProps) {
  const gen = useAIGeneration();
  const [steps, setSteps] = useState(freshSteps);
  const [phase, setPhase] = useState<Phase>("running");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoPRResult | null>(null);
  const [repoState, setRepoState] = useState<AutoPRRepoState | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [switching, setSwitching] = useState(false);
  const runRef = useRef(0);
  const cancelRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  const report = (
    runId: number,
    id: AutoPRStepId,
    status: AutoPRStepStatus,
    detail?: string,
  ) => {
    if (runRef.current !== runId || !openRef.current) return;
    setSteps((prev) => ({ ...prev, [id]: { id, status, detail } }));
  };

  const start = async () => {
    if (!ai) return;
    const runId = ++runRef.current;
    cancelRef.current = false;
    setSteps(freshSteps());
    setPhase("running");
    setError(null);
    setResult(null);
    setRepoState(null);
    setCanceling(false);
    const alive = () => runRef.current === runId && openRef.current;
    const guarded = <T,>(fn: () => Promise<T>): Promise<T> => {
      if (cancelRef.current) return Promise.reject(CANCELED);
      return fn();
    };
    const { cli, model, effort, fast } = ai;
    const ops: AutoPROps = {
      generateBranchName: () =>
        guarded(() =>
          gen.run((genId) =>
            GenerateBranchName(projectName, projectPath, cli, model, effort, fast, genId),
          ),
        ),
      createBranch: (name) => guarded(() => CreateBranch(projectPath, name)),
      changedPaths: () =>
        guarded(async () =>
          ((await GitChangedFiles(projectPath)) || []).map(
            (f: main.ChangedFile) => f.path,
          ),
        ),
      generateCommitMessage: (paths) =>
        guarded(() =>
          gen.run((genId) =>
            GenerateCommitMessage(
              projectName,
              projectPath,
              cli,
              model,
              effort,
              fast,
              paths,
              "",
              genId,
            ),
          ),
        ),
      commit: (message, paths) => guarded(() => GitCommit(projectPath, message, paths)),
      push: () =>
        guarded(() => {
          const cfg = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
          return GitPush(projectPath, pushFlags(cfg));
        }),
      generatePRTitle: (base) =>
        guarded(() =>
          gen.run((genId) =>
            GeneratePRTitle(projectName, projectPath, cli, model, effort, fast, base, genId),
          ),
        ),
      generatePRDescription: (base) =>
        guarded(() =>
          gen.run((genId) =>
            GeneratePRDescription(
              projectName,
              projectPath,
              cli,
              model,
              effort,
              fast,
              base,
              genId,
            ),
          ),
        ),
      createPullRequest: (title, body, base) =>
        guarded(() => CreatePullRequest(projectPath, title, body, base)),
    };

    try {
      const [status, defaultBranch] = await Promise.all([
        GitStatus(projectPath),
        GitDefaultBranch(projectPath),
      ]);
      if (!alive()) return;
      const state: AutoPRRepoState = {
        branch: status?.branch ?? "",
        defaultBranch,
        detached: !!status?.detached,
        uncommitted: status?.uncommitted ?? 0,
        hasUpstream: !!status?.hasUpstream,
        ahead: status?.ahead ?? 0,
      };
      setRepoState(state);
      const reason = nothingToSubmitReason(state);
      if (reason) throw new Error(reason);
      const res = await runAutoPR(state, ops, (id, status, detail) =>
        report(runId, id, status, detail),
      );
      rememberCreatedPr(projectPath, res.branch, res.url, res.title);
      onChanged();
      if (!alive()) return;
      setResult(res);
      setPhase("done");
    } catch (err) {
      onChanged();
      if (!alive()) return;
      if (isCanceledError(err) || err === CANCELED) {
        setSteps((prev) => {
          const next = { ...prev };
          for (const id of AUTO_PR_STEP_IDS) {
            if (next[id].status === "running" || next[id].status === "failed") {
              next[id] = { id, status: "pending" };
            }
          }
          return next;
        });
        setPhase("canceled");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("failed");
      }
      setCanceling(false);
    }
  };

  const cancel = () => {
    if (phase !== "running") return;
    cancelRef.current = true;
    setCanceling(true);
    gen.cancel();
  };

  const closeModal = () => {
    if (switching) return;
    cancel();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    void start();
  }, [open]);

  const running = phase === "running";

  return (
    <Modal
      open={open}
      onClose={closeModal}
      backdrop={false}
      draggable
      closeOnEscape={!switching}
      zIndexClassName="z-[60]"
      contentClassName="w-[520px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Auto Create PR
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            AI names the branch, writes the commit and pull request, then opens
            it on GitHub.
          </p>
        </div>
        <button
          onClick={closeModal}
          disabled={switching}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5">
        {result && phase === "done" ? (
          <PRCreatedView
            projectPath={projectPath}
            branch={result.branch}
            base={result.base}
            url={result.url}
            onSwitched={() => {
              onChanged();
              onClose();
            }}
            onBusyChange={setSwitching}
          />
        ) : (
          <AutoPRStepList steps={steps} repoState={repoState} />
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[var(--border)] px-5 py-3">
        {phase === "failed" && error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-[12px] leading-snug text-[var(--accent-red-text)]">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--accent-red)]" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            {phase === "canceled" && <span>Canceled</span>}
            {phase !== "done" && (
              <button
                onClick={() => {
                  EventsEmit("navigate-pr-instructions");
                  closeModal();
                }}
                className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Edit AI Instructions
              </button>
            )}
          </span>
          <div className="flex gap-2">
            {running ? (
              <button
                onClick={cancel}
                disabled={canceling}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                {canceling ? "Canceling…" : "Cancel"}
              </button>
            ) : (
              <button
                onClick={closeModal}
                disabled={switching}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                Close
              </button>
            )}
            {(phase === "failed" || phase === "canceled") && (
              <button
                onClick={() => void start()}
                className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90"
              >
                Run again
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
