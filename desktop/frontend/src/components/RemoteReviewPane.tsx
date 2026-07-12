import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { MonacoDiffPool } from "./review/MonacoDiffPool";
import {
  makeRemoteReviewSource,
  remoteGitSummary,
  remoteGitCommit,
  remoteGitPush,
  remoteGitPull,
  remoteGitGenMessage,
  remoteGitWatch,
  remoteGitUnwatch,
  type RemoteGitSummary,
} from "./review/remoteReviewSource";
import { SegmentedControl } from "./ui/SegmentedControl";
import { RefreshIcon, FileIcon } from "./icons";
import { toast } from "../toast";

interface PeerFrameEvent {
  peerId: string;
  frame: { t?: string; project?: string };
}

const FONT_SIZE = 13;

export function RemoteReviewPane({
  peerId,
  project,
  active = true,
  onSummary,
}: {
  peerId: string;
  project: string;
  active?: boolean;
  onSummary?: (s: RemoteGitSummary) => void;
}) {
  const [summary, setSummary] = useState<RemoteGitSummary | null>(null);
  const [sideBySide, setSideBySide] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<
    null | "commit" | "push" | "pull" | "generate"
  >(null);
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  const sources = useMemo(
    () => makeRemoteReviewSource(peerId, project),
    [peerId, project],
  );

  const refresh = useCallback(async () => {
    try {
      const s = await remoteGitSummary(peerId, project);
      setSummary(s);
      onSummaryRef.current?.(s);
    } catch {
      /* transient — a git-changed or manual refresh retries */
    }
  }, [peerId, project]);

  useEffect(() => {
    void refresh();
    remoteGitWatch(peerId, project);
    return () => remoteGitUnwatch(peerId, project);
  }, [peerId, project, refresh]);

  // The remote push carries only the project (no per-file payload), so a change
  // triggers a full re-list + a pool remount to refetch diffs.
  useEffect(
    () =>
      EventsOn("peer-frame", (m: PeerFrameEvent) => {
        if (
          m?.peerId === peerId &&
          m.frame?.t === "git-changed" &&
          m.frame.project === project
        ) {
          void refresh();
          setReloadKey((k) => k + 1);
        }
      }),
    [peerId, project, refresh],
  );

  const files = summary?.files ?? [];
  const changedPaths = useMemo(() => files.map((f) => f.path), [files]);

  const run = async (
    kind: "commit" | "push" | "pull" | "generate",
    op: () => Promise<void>,
  ) => {
    setBusy(kind);
    try {
      await op();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "That didn't work on the other Mac.",
      );
    } finally {
      setBusy(null);
    }
  };

  const commit = () =>
    run("commit", async () => {
      await remoteGitCommit(peerId, project, message.trim(), changedPaths);
      setMessage("");
      await refresh();
    });
  const push = () =>
    run("push", () => remoteGitPush(peerId, project).then(refresh));
  const pull = () =>
    run("pull", () => remoteGitPull(peerId, project).then(refresh));
  const generate = () =>
    run("generate", async () => {
      const m = await remoteGitGenMessage(peerId, project, changedPaths);
      if (m) setMessage(m);
    });

  const ahead = summary?.ahead ?? 0;
  const behind = summary?.behind ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px]">
        <span className="font-medium text-[var(--text-primary)]">
          {summary?.branch || "—"}
        </span>
        {(ahead > 0 || behind > 0) && (
          <span className="text-[var(--text-muted)]">
            {ahead > 0 && `↑${ahead}`} {behind > 0 && `↓${behind}`}
          </span>
        )}
        <span className="text-[var(--text-muted)]">
          {files.length} {files.length === 1 ? "file" : "files"} changed
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            value={sideBySide ? "split" : "unified"}
            onChange={(v) => setSideBySide(v === "split")}
            options={[
              { value: "split", label: "Split" },
              { value: "unified", label: "Unified" },
            ]}
          />
          <button
            onClick={() => void refresh()}
            title="Refresh"
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <FileIcon />
          <p className="text-xs">No changes in this project.</p>
        </div>
      ) : (
        <MonacoDiffPool
          key={reloadKey}
          sources={sources}
          projectRoot={project}
          files={files}
          mode="working"
          baseBranch=""
          fontSize={FONT_SIZE}
          sideBySide={sideBySide}
          active={active}
          authority={`remote:${peerId}:${project}`}
        />
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
        />
        <button
          onClick={generate}
          disabled={busy !== null || files.length === 0}
          title="Draft a commit message with AI"
          className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {busy === "generate" ? "…" : "AI"}
        </button>
        <button
          onClick={commit}
          disabled={
            busy !== null || files.length === 0 || message.trim() === ""
          }
          className="shrink-0 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {busy === "commit" ? "Committing…" : "Commit"}
        </button>
        <button
          onClick={pull}
          disabled={busy !== null}
          className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {busy === "pull" ? "Pulling…" : "Pull"}
        </button>
        <button
          onClick={push}
          disabled={busy !== null}
          className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {busy === "push" ? "Pushing…" : "Push"}
        </button>
      </div>
    </div>
  );
}
