import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import {
  BranchIcon,
  CopyIcon,
  DownloadIcon,
  GitCommitIcon,
  PRIcon,
  RefreshIcon,
  UndoIcon,
  UploadIcon,
} from "./icons";
import {
  GitFetchAll,
  GitPush,
  GitStatus as ApiGitStatus,
  PullBranch,
} from "../../bridge/commands";
import { main } from "../../bridge/models";
import { getSettings } from "../store/settings";
import {
  DEFAULT_PULL_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_FETCH_CONFIG,
  pullFlags,
  pushFlags,
  fetchFlags,
} from "../gitOptions";

interface ProjectGitSubmenuProps {
  projectPath: string | null;
  onCommit: () => void;
  onCreatePR: () => void;
  onSwitchBranch: () => void;
  onDiscardAll: () => void;
  onClose: () => void;
}

interface GitSubmenuItemsProps extends ProjectGitSubmenuProps {
  status: main.GitStatus | null;
  loading: boolean;
}

export function ProjectGitSubmenu(props: ProjectGitSubmenuProps) {
  const { projectPath } = props;
  const [status, setStatus] = useState<main.GitStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetched when the context menu opens (not on submenu hover) so the
  // uncommitted-changes dot can show on the Git row before it is expanded.
  useEffect(() => {
    if (!projectPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ApiGitStatus(projectPath)
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectPath]);

  const uncommitted = status?.isGitRepo ? status.uncommitted : 0;

  return (
    <ContextMenuSubmenu
      label={
        <span className="flex items-center gap-1.5">
          Git
          {uncommitted > 0 && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-blue)]"
              title={`${uncommitted} uncommitted file${uncommitted === 1 ? "" : "s"}`}
            />
          )}
        </span>
      }
      icon={<BranchIcon size={14} />}
      disabled={!projectPath}
    >
      <GitSubmenuItems {...props} status={status} loading={loading} />
    </ContextMenuSubmenu>
  );
}

function GitSubmenuItems({
  projectPath,
  onCommit,
  onCreatePR,
  onSwitchBranch,
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

  const runOp = (
    loadingMsg: string,
    successMsg: string,
    errorLabel: string,
    op: () => Promise<unknown>,
  ) => {
    onClose();
    toast.promise(op(), {
      loading: loadingMsg,
      success: successMsg,
      error: (err) => `${errorLabel} failed: ${err}`,
    });
  };

  const copyBranch = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(status.branch);
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
        onClick={() =>
          runOp("Pulling…", "Pulled", "Pull", () => {
            const cfg = getSettings().gitPull ?? DEFAULT_PULL_CONFIG;
            return PullBranch(projectPath, cfg.strategy, pullFlags(cfg));
          })
        }
      />
      <ContextMenuItem
        label="Push"
        icon={<UploadIcon />}
        onClick={() =>
          runOp("Pushing…", "Pushed", "Push", () => {
            const cfg = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
            return GitPush(projectPath, pushFlags(cfg));
          })
        }
      />
      <ContextMenuItem
        label="Fetch"
        icon={<RefreshIcon />}
        onClick={() =>
          runOp("Fetching…", "Fetched", "Fetch", () => {
            const cfg = getSettings().gitFetch ?? DEFAULT_FETCH_CONFIG;
            return GitFetchAll(projectPath, fetchFlags(cfg));
          })
        }
      />
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
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Copy branch name"
        icon={<CopyIcon />}
        onClick={copyBranch}
        disabled={!status.branch}
      />
      <div
        className="truncate px-3 pb-1 pt-1.5 font-mono text-[10px] font-medium tracking-wide text-[var(--text-muted)]"
        title={status.branch}
      >
        {status.branch || "detached"}
      </div>
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
