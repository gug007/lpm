import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { PeerSend } from "../../bridge/commands";
import { usePeersStore, type RemoteStatusEntry, type RemoteTerminal } from "../store/peers";
import { useActionsByDisplay } from "../hooks/useActionsByDisplay";
import { servicePortMap, tabPort } from "../remoteTabs";
import { RemoteTerminalMirror } from "./RemoteTerminalMirror";
import { RemoteComposer } from "./RemoteComposer";
import { RemoteReviewPane } from "./RemoteReviewPane";
import { remoteGitSummary } from "./review/remoteReviewSource";
import { ActionView } from "./ActionView";
import { HeaderTab } from "./terminal/HeaderTab";
import { AppTip } from "./AppTip";
import { ConfirmDialog, type ConfirmVariant } from "./ui/ConfirmDialog";
import { RenameModal } from "./RenameModal";
import { TerminalIcon, PlusIcon, BranchIcon } from "./icons";
import type { ActionInfo } from "../types";
import { toast } from "../toast";

interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  variant: ConfirmVariant;
  onConfirm: () => void;
}

const EMPTY_TERMS: RemoteTerminal[] = [];
const EMPTY_STATUS: RemoteStatusEntry[] = [];
const ALL = "__all__";

export function RemoteProjectView({ peerId, project }: { peerId: string; project: string }) {
  const peer = usePeersStore((s) => s.peers.find((p) => p.id === peerId) ?? null);
  const projectInfo = usePeersStore((s) => s.projectsByPeer[peerId]?.find((p) => p.name === project) ?? null);
  const terminals = usePeersStore((s) => s.terminalsByPeer[peerId]?.[project] ?? EMPTY_TERMS);
  const statusEntries = usePeersStore((s) => s.statusByPeer[peerId]?.[project] ?? EMPTY_STATUS);
  const requestTerminals = usePeersStore((s) => s.requestTerminals);
  const requestStatus = usePeersStore((s) => s.requestStatus);
  const lastError = usePeersStore((s) => s.lastError);

  const [activeId, setActiveId] = useState<string>(ALL);
  const [showChanges, setShowChanges] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; current: string } | null>(null);
  const [git, setGit] = useState<{ isRepo: boolean; branch: string; changed: number }>({
    isRepo: false,
    branch: "",
    changed: 0,
  });

  useEffect(() => {
    requestTerminals(peerId, project);
    requestStatus(peerId, project);
    setShowChanges(false);
  }, [peerId, project, requestTerminals, requestStatus]);

  useEffect(() => {
    let cancelled = false;
    void remoteGitSummary(peerId, project)
      .then((s) => {
        if (!cancelled) setGit({ isRepo: s.isRepo, branch: s.branch, changed: s.files.length });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId, project]);

  const lastToastSeq = useRef(usePeersStore.getState().lastError?.seq ?? 0);
  useEffect(() => {
    if (lastError && lastError.seq > lastToastSeq.current) {
      lastToastSeq.current = lastError.seq;
      toast.error(lastError.text);
    }
  }, [lastError]);

  useEffect(() => {
    if (terminals.length === 0) return;
    setActiveId((cur) => (cur === ALL || terminals.some((t) => t.id === cur) ? cur : ALL));
  }, [terminals]);

  const active = useMemo(
    () => (activeId === ALL ? null : terminals.find((t) => t.id === activeId) ?? null),
    [terminals, activeId],
  );

  const statusByTerm = useMemo(() => {
    const map: Record<string, RemoteStatusEntry> = {};
    for (const e of statusEntries) {
      if (!e.paneID) continue;
      const cur = map[e.paneID];
      if (!cur || (e.priority ?? 0) > (cur.priority ?? 0)) map[e.paneID] = e;
    }
    return map;
  }, [statusEntries]);

  const { headerActions, footerActions } = useActionsByDisplay(projectInfo?.actions);
  const ports = useMemo(
    () => servicePortMap(projectInfo?.allServices ?? projectInfo?.services),
    [projectInfo],
  );

  const connected = peer?.status === "connected";
  const running = projectInfo?.running ?? false;
  const macName = peer?.name ?? "this Mac";

  const send = (frame: Record<string, unknown>) => void PeerSend(peerId, frame);
  const runAction = (a: ActionInfo) => send({ t: "runAction", project, action: a.name });

  const openTab = (id: string) => {
    setShowChanges(false);
    setActiveId(id);
    if (id !== ALL) {
      const entry = statusByTerm[id];
      if (entry) setDismissed((d) => ({ ...d, [id]: entry.key }));
    }
  };

  const closeTab = (id: string, label: string) =>
    setConfirmState({
      title: "Close terminal",
      body: `Close "${label || id}" on ${macName}? This ends the session.`,
      confirmLabel: "Close",
      variant: "destructive",
      onConfirm: () => send({ t: "closeTerminal", project, id }),
    });

  const renameTab = (id: string, current: string) => setRenaming({ id, current });

  const tabState = (id: string) => {
    const entry = statusByTerm[id];
    if (!entry || dismissed[id] === entry.key) return {};
    switch (entry.value) {
      case "Waiting":
        return { waiting: true };
      case "Running":
        return { shimmer: true };
      case "Done":
        return { done: true };
      case "Error":
        return { error: true };
      default:
        return {};
    }
  };

  return (
    <div className="flex h-full flex-col pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: connected ? "var(--accent-green)" : "var(--text-muted)" }}
        />
        <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{project}</h1>
        <span className="truncate text-xs text-[var(--text-muted)]">on {macName}</span>
        {connected &&
          headerActions.map((a) => (
            <ActionView key={a.name} action={a} compact={false} disabled={false} onRun={runAction} />
          ))}
        {connected && (
          <button
            onClick={() => send(running ? { t: "stop", name: project } : { t: "start", name: project })}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
            style={{ backgroundColor: running ? "var(--accent-red)" : "var(--accent-green)" }}
          >
            {running ? "Stop" : "Start"}
          </button>
        )}
      </div>

      {!connected ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <TerminalIcon />
          <p className="text-xs">Can't reach this Mac right now.</p>
        </div>
      ) : showChanges && git.isRepo ? (
        <RemoteReviewPane
          peerId={peerId}
          project={project}
          active
          onSummary={(s) => setGit({ isRepo: s.isRepo, branch: s.branch, changed: s.files.length })}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--terminal-header)] px-1.5 py-1">
            {terminals.length > 1 && (
              <HeaderTab label="All" active={activeId === ALL} onClick={() => openTab(ALL)} />
            )}
            {terminals.map((t) => {
              const port = tabPort(t.label, ports);
              return (
                <HeaderTab
                  key={t.id}
                  label={t.label || t.id}
                  active={activeId === t.id}
                  onClick={() => openTab(t.id)}
                  onClose={() => closeTab(t.id, t.label)}
                  onContextMenu={(e: MouseEvent) => {
                    e.preventDefault();
                    renameTab(t.id, t.label || t.id);
                  }}
                  trailing={port ? <span className="opacity-60">:{port}</span> : undefined}
                  {...tabState(t.id)}
                />
              );
            })}
            <button
              onClick={() => send({ t: "newTerminal", project })}
              title="New terminal"
              className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PlusIcon />
            </button>
          </div>

          {terminals.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <TerminalIcon />
              <p className="text-xs">No terminals open in this project.</p>
            </div>
          ) : activeId === ALL ? (
            <div
              className="grid min-h-0 flex-1 gap-1 overflow-auto p-1"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))" }}
            >
              {terminals.map((t) => (
                <div key={t.id} className="min-h-[16rem] overflow-hidden rounded border border-[var(--border)]">
                  <RemoteTerminalMirror peerId={peerId} terminal={t} />
                </div>
              ))}
            </div>
          ) : active ? (
            <>
              <RemoteTerminalMirror key={`${peerId}:${active.id}`} peerId={peerId} terminal={active} />
              <RemoteComposer peerId={peerId} project={project} terminal={active} />
            </>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 bg-[var(--terminal-bg)] px-2 py-1">
        <AppTip />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
          {connected &&
            footerActions.map((a) => (
              <ActionView key={a.name} action={a} compact disabled={false} onRun={runAction} />
            ))}
          {git.isRepo && (
            <button
              onClick={() => setShowChanges((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                showChanges
                  ? "border-[var(--accent-cyan)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <BranchIcon />
              <span className="max-w-[10rem] truncate">{git.branch || "changes"}</span>
              {git.changed > 0 && (
                <span className="rounded-full bg-[var(--accent-cyan)] px-1.5 text-[10px] text-white">
                  {git.changed}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title}
        body={confirmState?.body ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
      />
      <RenameModal
        open={renaming !== null}
        title="Rename terminal"
        initialValue={renaming?.current ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={(value) => {
          if (renaming) send({ t: "renameTerminal", project, id: renaming.id, label: value });
        }}
      />
    </div>
  );
}
