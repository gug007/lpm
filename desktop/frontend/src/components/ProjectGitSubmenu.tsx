import { useEffect, useState } from "react";
import { toast } from "../notifications/toast";
import { AutoPullMenuItems } from "./AutoPullMenuItems";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import { Tooltip } from "./ui/Tooltip";
import { UndoAutoPullItem } from "./UndoAutoPullItem";
import {
  BranchIcon,
  CopyIcon,
  DownloadIcon,
  GitCommitIcon,
  HistoryIcon,
  PRIcon,
  RefreshIcon,
  UndoIcon,
  UploadIcon,
} from "./icons";
import { DiffStatText } from "./DiffStatText";
import {
  GitDiffStat,
  GitFetchAll,
  GitPush,
  GitStatus as ApiGitStatus,
  PullBranch,
  SetClipboardText,
} from "../../bridge/commands";
import { main } from "../../bridge/models";
import type { DiffStat } from "../hooks/useGitStatus";
import { getSettings } from "../store/settings";
import {
  DEFAULT_PULL_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_FETCH_CONFIG,
  pullFlags,
  pushFlags,
  fetchFlags,
  type GitPullConfig,
} from "../gitOptions";
import { toastPullError } from "../gitPullErrors";
import { useAppStore } from "../store/app";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { pulledText, pushedText } from "../gitToastText";
import type { AutoPullMode } from "../autoPull";
import { useAutoPullMode } from "../hooks/useAutoPullMode";

interface ProjectGitSubmenuProps {
  projectPath: string | null;
  projectName: string;
  // Auto pull runs on the machine a project is on: not for an SSH host's.
  autoPull: boolean;
  onCommit: () => void;
  onCreatePR: () => void;
  onSwitchBranch: () => void;
  onHistory: () => void;
  onDiscardAll: () => void;
  onClose: () => void;
}

interface GitSubmenuItemsProps extends ProjectGitSubmenuProps {
  status: main.GitStatus | null;
  loading: boolean;
  autoPullMode: AutoPullMode | null;
}

export function ProjectGitSubmenu(props: ProjectGitSubmenuProps) {
  const { projectPath } = props;
  const autoPullMode = useAutoPullMode(props.projectName);
  const [status, setStatus] = useState<main.GitStatus | null>(null);
  const [diffStat, setDiffStat] = useState<DiffStat | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetched when the context menu opens (not on submenu hover) so the
  // uncommitted changes can show on the Git row before it is expanded.
  useEffect(() => {
    if (!projectPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      ApiGitStatus(projectPath),
      // A paired Mac on an older lpm can't count lines; null keeps the plain dot.
      (GitDiffStat(projectPath) as Promise<DiffStat>).catch(() => null),
    ])
      .then(([s, d]) => {
        if (cancelled) return;
        setStatus(s);
        setDiffStat(d);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setDiffStat(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectPath]);

  const uncommitted = status?.isGitRepo ? status.uncommitted : 0;

  return (
    <ContextMenuSubmenu
      label={
        <span className="flex items-center gap-1.5">
          Git
          {uncommitted > 0 &&
            (diffStat && diffStat.files > 0 ? (
              <DiffStatText
                stat={diffStat}
                className="ml-0.5 text-[11px] font-medium text-[var(--text-muted)]"
              />
            ) : (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-blue)]"
                title={`${uncommitted} uncommitted file${uncommitted === 1 ? "" : "s"}`}
              />
            ))}
        </span>
      }
      icon={<BranchIcon size={14} />}
      disabled={!projectPath}
    >
      <GitSubmenuItems {...props} status={status} loading={loading} autoPullMode={autoPullMode} />
    </ContextMenuSubmenu>
  );
}

function GitSubmenuItems({
  projectPath,
  projectName,
  autoPull,
  autoPullMode,
  onCommit,
  onCreatePR,
  onSwitchBranch,
  onHistory,
  onDiscardAll,
  onClose,
  status,
  loading,
}: GitSubmenuItemsProps) {
  if (loading) {
    return <Hint>Loading…</Hint>;
  }
  if (!projectPath || !status?.isGitRepo) {
    return <Hint>Not a Git repository</Hint>;
  }

  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // Read when the work starts: the toast names the project the menu was for.
  const label = () => displayNameForProjectName(projectName, useAppStore.getState().projects);

  const runOp = (verb: string, failure: string, successMsg: string, op: () => Promise<unknown>) => {
    onClose();
    const name = label();
    const run = (): void => {
      toast.promise(op(), {
        loading: `${verb} ${name}`,
        description: status.branch,
        success: successMsg,
        error: (err) => `${failure} ${name}: ${err}`,
        retry: run,
      });
    };
    run();
  };

  const pull = (cfg: GitPullConfig) => {
    const name = label();
    const id = toast.loading(`Pulling ${name}`, { description: `${status.branch} from origin` });
    PullBranch(projectPath, cfg.strategy, pullFlags(cfg)).then(
      () => toast.success(pulledText(status.behind, status.branch), { id, description: name }),
      (err) =>
        toastPullError(err, {
          label: `Couldn't pull ${name}`,
          id,
          retry: () => pull(cfg),
          retryWithAutostash: () => pull({ ...cfg, autostash: true }),
        }),
    );
  };

  const copyBranch = async () => {
    onClose();
    try {
      await SetClipboardText(status.branch);
      toast.success("Copied branch name");
    } catch {
      toast.error("Copy failed");
    }
  };

  const noChanges = status.uncommitted === 0;

  return (
    <>
      <ContextMenuItem
        label="Pull"
        icon={<DownloadIcon />}
        onClick={() => {
          onClose();
          pull(getSettings().gitPull ?? DEFAULT_PULL_CONFIG);
        }}
      />
      <ContextMenuItem
        label="Push"
        icon={<UploadIcon />}
        onClick={() =>
          runOp("Pushing", "Couldn't push", pushedText(status.ahead, status.branch), () => {
            const cfg = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
            return GitPush(projectPath, pushFlags(cfg));
          })
        }
      />
      <ContextMenuItem
        label="Fetch"
        icon={<RefreshIcon />}
        onClick={() =>
          runOp("Fetching", "Couldn't fetch", "Fetched", () => {
            const cfg = getSettings().gitFetch ?? DEFAULT_FETCH_CONFIG;
            return GitFetchAll(projectPath, fetchFlags(cfg));
          })
        }
      />
      {autoPull && autoPullMode && (
        <>
          <ContextMenuSeparator />
          <AutoPullMenuItems projectName={projectName} mode={autoPullMode} onClose={onClose} />
          <UndoAutoPullItem projectPath={projectPath} projectName={projectName} onClose={onClose} />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem label="Switch branch…" icon={<BranchIcon size={14} />} onClick={close(onSwitchBranch)} />
      <ContextMenuItem
        label="Commit…"
        icon={<GitCommitIcon />}
        onClick={close(onCommit)}
        disabled={noChanges}
        title={noChanges ? "No changes to commit" : undefined}
      />
      <ContextMenuItem label="Create PR…" icon={<PRIcon />} onClick={close(onCreatePR)} />
      <ContextMenuItem label="History" icon={<HistoryIcon />} onClick={close(onHistory)} />
      <ContextMenuSeparator />
      <Tooltip content={status.branch || "Detached HEAD"} align="start" triggerClassName="flex w-full">
        <ContextMenuItem
          label="Copy branch name"
          icon={<CopyIcon />}
          onClick={copyBranch}
          disabled={!status.branch}
        />
      </Tooltip>
      <ContextMenuItem
        destructive
        label="Discard all changes…"
        icon={<UndoIcon />}
        onClick={close(onDiscardAll)}
        disabled={noChanges}
        title={noChanges ? "No changes to discard" : undefined}
      />
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">{children}</div>;
}
