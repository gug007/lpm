import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PeerSend } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import {
  usePeersStore,
  type PeerFrame,
  type RemoteStatusEntry,
  type RemoteTerminal,
} from "../store/peers";
import { peerRequest } from "../store/peerRequest";
import { makeRemoteComposerSource } from "../remoteComposerSource";
import { makeRemoteHistorySource } from "../remoteHistorySource";
import { makeRemoteConfigSource } from "../remoteConfigSource";
import { makeRemoteInstructionsSource } from "../remoteInstructionsSource";
import { remoteRestartService } from "../remoteServices";
import { useActionsByDisplay } from "../hooks/useActionsByDisplay";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { servicePortMap } from "../remoteTabs";
import { RemoteTerminalMirror } from "./RemoteTerminalMirror";
import { RemotePaneLayout } from "./RemotePaneLayout";
import { RemoteServiceLog } from "./RemoteServiceLog";
import { TerminalComposer } from "./TerminalComposer";
import { EmptyTerminalState } from "./project-detail/EmptyTerminalState";
import { RemoteReviewPane } from "./RemoteReviewPane";
import { RemoteBranchMenu } from "./RemoteBranchMenu";
import { RemoteCommitButton } from "./RemoteCommitButton";
import { RemoteStartStopGroup } from "./RemoteStartStopGroup";
import { RemoteTerminalTabs } from "./RemoteTerminalTabs";
import { RemotePRModal } from "./RemotePRModal";
import { remoteGitSummary, remoteGitDiscardAll } from "./review/remoteReviewSource";
import { remoteServices, type RemoteServiceInfo } from "../remoteServices";
import { bracketedPaste } from "../remoteInput";
import { ActionView } from "./ActionView";
import { ConfigEditor } from "./ConfigEditor";
import { ProjectAIInstructions } from "./ProjectAIInstructions";
import { NotesView } from "./NotesView";
import { ActionInputsModal } from "./project-detail/ActionInputsModal";
import { makeRemoteNotesCommands } from "../remoteNotesCommands";
import { HeaderTab } from "./terminal/HeaderTab";
import { IconBtn } from "./terminal/IconBtn";
import { SplitRightIcon } from "./terminal/icons";
import { AppTip } from "./AppTip";
import { Tooltip } from "./ui/Tooltip";
import { ConfirmDialog, type ConfirmVariant } from "./ui/ConfirmDialog";
import { RenameModal } from "./RenameModal";
import {
  BulkDuplicateDialog,
  type BulkDuplicateOptions,
  type DuplicatePromptSeed,
} from "./BulkDuplicateDialog";
import {
  TerminalIcon,
  PlusIcon,
  ZapIcon,
  CopyIcon,
  TrashIcon,
  CodeIcon,
  MessageIcon,
  SparkleIcon,
} from "./icons";
import type { ActionInfo, ProjectInfo, SpawnTask } from "../types";
import { toast } from "../toast";

const COMPOSER_FONT_SIZE = 13;
const SVC_ALL = "__svc_all__";
const svcId = (paneIndex: number) => `svc:${paneIndex}`;

// The remote duplicate's run task carries a single-line prompt string; a composer
// seed may arrive as ordered paste parts (text + image paths) — flatten to text,
// since image attachments can't ride the duplicate frame.
function flattenPrompt(p: string | string[] | undefined): string {
  if (!p) return "";
  return (Array.isArray(p) ? p.join(" ") : p).replace(/\s+/g, " ").trim();
}

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

export function RemoteProjectView({
  peerId,
  project,
}: {
  peerId: string;
  project: string;
}) {
  const peer = usePeersStore(
    (s) => s.peers.find((p) => p.id === peerId) ?? null,
  );
  const projectInfo = usePeersStore(
    (s) => s.projectsByPeer[peerId]?.find((p) => p.name === project) ?? null,
  );
  const terminals = usePeersStore(
    (s) => s.terminalsByPeer[peerId]?.[project] ?? EMPTY_TERMS,
  );
  const statusEntries = usePeersStore(
    (s) => s.statusByPeer[peerId]?.[project] ?? EMPTY_STATUS,
  );
  const requestTerminals = usePeersStore((s) => s.requestTerminals);
  const requestStatus = usePeersStore((s) => s.requestStatus);
  const lastError = usePeersStore((s) => s.lastError);

  const [activeId, setActiveId] = useState<string>(ALL);
  const [showChanges, setShowChanges] = useState(false);
  const [panes, setPanes] = useState(false);
  const [services, setServices] = useState<RemoteServiceInfo[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [prOpen, setPrOpen] = useState(false);
  // Which surface fills the body: the terminal(s), or one of the mirrored detail
  // editors (project config / notes / AI instructions) — same set the local
  // ProjectDetail toggles, driven over the wire.
  const [detailView, setDetailView] = useState<
    "terminal" | "config" | "notes" | "ai"
  >("terminal");
  // An action awaiting its inputs before it runs on the peer. Reuses the local
  // ActionInputsModal; the collected values ride the runAction frame.
  const [inputsAction, setInputsAction] = useState<ActionInfo | null>(null);
  const [renaming, setRenaming] = useState<{
    id: string;
    current: string;
  } | null>(null);
  const [git, setGit] = useState<{
    isRepo: boolean;
    branch: string;
    changed: number;
  }>({
    isRepo: false,
    branch: "",
    changed: 0,
  });
  // The Duplicate dialog, opened either from the composer's "run in duplicates"
  // (carrying a prompt seed) or the header Duplicate control (seed null). Nonce
  // remounts it so a re-trigger re-seeds even while it's already up.
  const [dupDialog, setDupDialog] = useState<{ seed: DuplicatePromptSeed | null } | null>(null);
  const [duplicateNonce, setDuplicateNonce] = useState(0);
  const duplicateRunHere = useRef<(() => Promise<void>) | null>(null);
  // Live HUD while the peer clones copies (its streamed duplicateProgress frames).
  const [dupProgress, setDupProgress] = useState<{
    done: number;
    total: number;
    name: string;
  } | null>(null);
  // The peer's persisted duplicate-modal defaults, so the dialog opens matching
  // the other Mac rather than this one's local settings.
  const [dupDefaults, setDupDefaults] = useState<{
    excludeUncommitted: boolean;
    reinstallDeps: boolean;
    pullLatest: boolean;
  } | null>(null);

  // The full project info (the store's RemoteProject is a loose passthrough of
  // the same JSON the local ProjectInfo carries — profiles, allServices, and the
  // running `services` list included).
  const pInfo = projectInfo as unknown as ProjectInfo | null;
  const runningServiceNames = useMemo(
    () => new Set((pInfo?.services ?? []).map((s) => s.name)),
    [pInfo?.services],
  );
  // A stable signature of the running services, so a per-service toggle (which
  // refreshes projectInfo via projects-changed but may not flip `running`)
  // re-fetches the service tabs + log panes below.
  const runningKey = useMemo(
    () => [...runningServiceNames].sort().join(","),
    [runningServiceNames],
  );

  useEffect(() => {
    requestTerminals(peerId, project);
    requestStatus(peerId, project);
    setShowChanges(false);
  }, [peerId, project, requestTerminals, requestStatus]);

  // Services (for the service tabs + log viewer) — refetched when the project's
  // running state flips (start/stop) or its running-service set changes (a
  // per-service toggle) so tabs appear/disappear like local.
  useEffect(() => {
    let cancelled = false;
    if (!projectInfo?.running) {
      setServices([]);
      return;
    }
    void remoteServices(peerId, project)
      .then((s) => {
        if (!cancelled)
          setServices(s.filter((x) => x.running && x.paneIndex !== null));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId, project, projectInfo?.running, runningKey]);

  const refreshGit = useCallback(() => {
    void remoteGitSummary(peerId, project)
      .then((s) =>
        setGit({ isRepo: s.isRepo, branch: s.branch, changed: s.files.length }),
      )
      .catch(() => {});
  }, [peerId, project]);
  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  // Stream the peer's duplicate progress into the HUD, clearing on the final
  // reply (and surfacing an error/warning like the phone does).
  useEffect(() => {
    return EventsOn("peer-frame", (m: { peerId: string; frame: PeerFrame }) => {
      if (!m || !m.frame || m.peerId !== peerId) return;
      const f = m.frame;
      if (f.t === "duplicateProgress") {
        setDupProgress({
          done: Number(f.done) || 0,
          total: Number(f.total) || 0,
          name: String(f.name ?? ""),
        });
      } else if (f.t === "duplicate") {
        setDupProgress(null);
        if (f.ok === false) toast.error(String(f.error ?? "Couldn't duplicate on the other Mac."));
        else if (f.warning) toast.error(String(f.warning));
        else toast.success(`Duplicated on ${peer?.name ?? "the other Mac"}`);
      }
    });
  }, [peerId, peer?.name]);

  // The peer's persisted duplicate-modal defaults, so the dialog opens matching
  // the other Mac rather than this one's local settings.
  useEffect(() => {
    let cancelled = false;
    void peerRequest(
      peerId,
      { t: "duplicateDefaults" },
      (f) => f.t === "duplicateDefaults",
      10000,
    )
      .then((r) => {
        if (cancelled) return;
        setDupDefaults({
          excludeUncommitted: !!r.excludeUncommitted,
          reinstallDeps: !!r.reinstallDeps,
          pullLatest: r.pullLatest !== false,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId]);

  const lastToastSeq = useRef(usePeersStore.getState().lastError?.seq ?? 0);
  useEffect(() => {
    if (lastError && lastError.seq > lastToastSeq.current) {
      lastToastSeq.current = lastError.seq;
      toast.error(lastError.text);
    }
  }, [lastError]);

  useEffect(() => {
    if (terminals.length === 0) return;
    setActiveId((cur) => {
      if (
        cur === ALL ||
        cur === SVC_ALL ||
        cur.startsWith("svc:") ||
        terminals.some((t) => t.id === cur)
      )
        return cur;
      return ALL;
    });
  }, [terminals]);

  // With services but no interactive terminals, land on a service tab.
  useEffect(() => {
    if (terminals.length > 0 || services.length === 0) return;
    setActiveId((cur) =>
      cur.startsWith("svc:") || cur === SVC_ALL
        ? cur
        : services.length > 1
          ? SVC_ALL
          : svcId(services[0].paneIndex as number),
    );
  }, [terminals.length, services]);

  const active = useMemo(
    () =>
      activeId === ALL
        ? null
        : (terminals.find((t) => t.id === activeId) ?? null),
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

  const { headerActions, footerActions } = useActionsByDisplay(
    projectInfo?.actions,
  );
  const ports = useMemo(
    () => servicePortMap(projectInfo?.allServices ?? projectInfo?.services),
    [projectInfo],
  );

  const connected = peer?.status === "connected";
  const running = projectInfo?.running ?? false;
  const macName = peer?.name ?? "this Mac";

  const send = (frame: Record<string, unknown>) => void PeerSend(peerId, frame);

  // Run an action on the peer. If it declares inputs, collect them locally via the
  // same ActionInputsModal the local view uses; if it needs confirmation, gate on
  // a ConfirmDialog. Either way the peer receives the resolved values and runs the
  // action directly — passing an `inputs` map (even empty) tells the peer the
  // controller already resolved it, so it doesn't pop a second modal on that Mac.
  const sendRunAction = (a: ActionInfo, inputs: Record<string, string>) =>
    send({ t: "runAction", project, action: a.name, inputs });
  const confirmRunAction = (a: ActionInfo, inputs: Record<string, string>) =>
    setConfirmState({
      title: a.label,
      body: `Run "${a.label}" on ${macName}?`,
      confirmLabel: "Run",
      variant: "default",
      onConfirm: () => sendRunAction(a, inputs),
    });
  const runAction = (a: ActionInfo) => {
    if (a.inputs && a.inputs.length > 0) {
      setInputsAction(a);
      return;
    }
    if (a.confirm) {
      confirmRunAction(a, {});
      return;
    }
    sendRunAction(a, {});
  };

  // Composer submit → the active remote terminal: auto-claim (become the live
  // owner, like run-action), then a bracketed paste and a SEPARATE carriage
  // return. Frames are awaited so their wire order is guaranteed (peer_send
  // resolves after enqueue); the sent prompt is recorded in the peer's history.
  const makeSubmit =
    (term: RemoteTerminal) =>
    (input: string | string[]): boolean => {
      const text = Array.isArray(input)
        ? input.filter((s): s is string => typeof s === "string").join("")
        : input;
      if (!text.trim()) return false;
      void (async () => {
        try {
          await PeerSend(peerId, { t: "claim", id: term.id });
          await PeerSend(peerId, {
            t: "in",
            id: term.id,
            d: bracketedPaste(text),
          });
          await PeerSend(peerId, { t: "in", id: term.id, d: "\r" });
          await PeerSend(peerId, {
            t: "historyAdd",
            project,
            id: term.id,
            label: term.label,
            text,
          });
        } catch {
          /* peer offline — draft already cleared optimistically */
        }
      })();
      return true;
    };

  // Per-terminal composer data layer (slash/mentions/actions/transform/upload/
  // draft) against the peer; recreated per active terminal so its id is fixed.
  const remoteComposerSource = useMemo(
    () => (active ? makeRemoteComposerSource(peerId, project, active.id) : null),
    [peerId, project, active?.id],
  );
  // Peer-backed message history for the composer's recall popover.
  const remoteHistorySource = useMemo(
    () => makeRemoteHistorySource(peerId, project),
    [peerId, project],
  );
  // Peer-backed config + AI-instruction editors (⌘E opens config, mirroring local).
  const remoteConfigSource = useMemo(
    () => makeRemoteConfigSource(peerId, project),
    [peerId, project],
  );
  const remoteInstructions = useMemo(
    () => makeRemoteInstructionsSource(peerId),
    [peerId],
  );
  // Peer-backed notes data layer for the mirrored NotesView.
  const remoteNotesCommands = useMemo(
    () => makeRemoteNotesCommands(peerId),
    [peerId],
  );
  useKeyboardShortcut(
    { key: "e", meta: true },
    () =>
      setDetailView((v) => (v === "config" ? "terminal" : "config")),
    connected,
  );

  const parentName = (projectInfo as { parentName?: string } | null)?.parentName ?? "";

  // "Run in duplicates" from the composer: open the seeded dialog and remember the
  // callback that runs the prompt in the current terminal (copy #1) on confirm.
  const runInDuplicates = useCallback(
    (seed: DuplicatePromptSeed, runHere: () => Promise<void>) => {
      duplicateRunHere.current = runHere;
      setDupDialog({ seed });
      setDuplicateNonce((n) => n + 1);
    },
    [],
  );

  const openDuplicate = () => {
    duplicateRunHere.current = null;
    setDupDialog({ seed: null });
    setDuplicateNonce((n) => n + 1);
  };

  const cancelDuplicate = () => {
    duplicateRunHere.current = null;
    setDupDialog(null);
  };

  // Confirm: run the seeded prompt in the current terminal (copy #1), then ask the
  // peer to create the copies. The peer's Rust does the clone + group + per-copy
  // task run and streams duplicateProgress; the wire carries one shared run task,
  // so per-copy overrides collapse to the first task and image attachments (which
  // can't cross the wire) are flattened to their text.
  const confirmDuplicate = async (count: number, opts: BulkDuplicateOptions) => {
    const runHere = duplicateRunHere.current;
    duplicateRunHere.current = null;
    setDupDialog(null);
    if (runHere) await runHere();
    const task: SpawnTask | undefined = opts.tasksPerCopy.find((t) => t.length > 0)?.[0];
    const prompt = flattenPrompt(task?.prompt);
    const frame: Record<string, unknown> = {
      t: "duplicate",
      name: project,
      count,
      labels: opts.labels,
      groupName: opts.groupName,
      excludeUncommitted: opts.excludeUncommitted,
      reinstallDeps: opts.reinstallDeps,
      pullLatest: opts.pullLatest,
      runMode: task ? task.kind : "none",
    };
    if (task?.kind === "action") frame.action = task.actionName;
    if (task?.kind === "command") frame.command = task.command;
    if (task && prompt) frame.prompt = prompt;
    setDupProgress({ done: 0, total: count, name: "" });
    send(frame);
  };

  const removeProject = () =>
    setConfirmState({
      title: "Remove copy",
      body: `Remove the duplicate "${project}" from ${macName}? This deletes its folder on that Mac.`,
      confirmLabel: "Remove",
      variant: "destructive",
      onConfirm: () => {
        void peerRequest(peerId, { t: "remove", name: project }, (f) => f.t === "remove", 20000)
          .then((r) => {
            if (r.ok === false) toast.error(String(r.error ?? "Couldn't remove the copy on the other Mac."));
            else toast.success(`Removed on ${macName}`);
          })
          .catch(() => toast.error("Couldn't reach this Mac."));
      },
    });

  const discardAll = () =>
    setConfirmState({
      title: "Discard all changes",
      body: `Discard every uncommitted change in "${project}" on ${macName}? This can't be undone.`,
      confirmLabel: "Discard",
      variant: "destructive",
      onConfirm: () => {
        void remoteGitDiscardAll(peerId, project)
          .then(() => {
            toast.success("Discarded all changes");
            refreshGit();
          })
          .catch((e) =>
            toast.error(
              e instanceof Error ? e.message : "Couldn't discard changes.",
            ),
          );
      },
    });

  const openTab = (id: string) => {
    setShowChanges(false);
    setPanes(false);
    setActiveId(id);
    if (id !== ALL) {
      const entry = statusByTerm[id];
      if (entry) setDismissed((d) => ({ ...d, [id]: entry.key }));
    }
  };

  const openService = (id: string) => {
    setShowChanges(false);
    setPanes(false);
    setActiveId(id);
  };

  const hasMultipleServices = services.length > 1;

  const closeTab = (id: string, label: string) =>
    setConfirmState({
      title: "Close terminal",
      body: `Close "${label || id}" on ${macName}? This ends the session.`,
      confirmLabel: "Close",
      variant: "destructive",
      onConfirm: () => send({ t: "closeTerminal", project, id }),
    });

  const renameTab = (id: string, current: string) =>
    setRenaming({ id, current });

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
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            backgroundColor: connected
              ? "var(--accent-green)"
              : "var(--text-muted)",
          }}
        />
        <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {project}
        </h1>
        <span className="truncate text-xs text-[var(--text-muted)]">
          on {macName}
        </span>
        {connected &&
          headerActions.map((a) => (
            <ActionView
              key={a.name}
              action={a}
              compact={false}
              disabled={false}
              onRun={runAction}
            />
          ))}
        {connected && (
          <Tooltip content="Actions are managed on the other Mac" side="bottom">
            <button
              type="button"
              disabled
              aria-label="Create action"
              className="flex h-7 shrink-0 cursor-not-allowed items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-2 text-xs text-[var(--text-muted)] opacity-60"
            >
              <PlusIcon />
              <span>Action</span>
            </button>
          </Tooltip>
        )}
        {connected && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <ViewButton
              active={detailView === "config"}
              label="Config (⌘E)"
              onClick={() =>
                setDetailView((v) => (v === "config" ? "terminal" : "config"))
              }
            >
              <CodeIcon />
            </ViewButton>
            <ViewButton
              active={detailView === "notes"}
              label="Notes"
              onClick={() =>
                setDetailView((v) => (v === "notes" ? "terminal" : "notes"))
              }
            >
              <MessageIcon />
            </ViewButton>
            <ViewButton
              active={detailView === "ai"}
              label="AI instructions"
              onClick={() =>
                setDetailView((v) => (v === "ai" ? "terminal" : "ai"))
              }
            >
              <SparkleIcon />
            </ViewButton>
            <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
            <Tooltip content={`Duplicate on ${macName}`} side="bottom">
              <button
                type="button"
                onClick={openDuplicate}
                aria-label="Duplicate project"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <CopyIcon />
              </button>
            </Tooltip>
            {parentName && (
              <Tooltip content="Remove this copy" side="bottom">
                <button
                  type="button"
                  onClick={removeProject}
                  aria-label="Remove duplicate"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)]"
                >
                  <TrashIcon />
                </button>
              </Tooltip>
            )}
          </div>
        )}
        {connected && (
          <RemoteStartStopGroup
            running={running}
            profiles={pInfo?.profiles ?? []}
            services={pInfo?.allServices ?? []}
            activeProfile={pInfo?.activeProfile ?? ""}
            runningServiceNames={runningServiceNames}
            onStart={(profile) =>
              send(
                profile
                  ? { t: "start", name: project, profile }
                  : { t: "start", name: project },
              )
            }
            onStop={() => send({ t: "stop", name: project })}
            onToggleService={(name) =>
              send({ t: "toggleService", name: project, service: name })
            }
            onRestartService={(name) =>
              void remoteRestartService(peerId, project, name)
                .then(() => toast.success(`Restarted ${name}`))
                .catch((e) =>
                  toast.error(
                    e instanceof Error ? e.message : "Couldn't restart the service.",
                  ),
                )
            }
          />
        )}
      </div>

      <div className="relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
        {dupProgress && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-xl">
            Creating copies on {macName}… {dupProgress.done}/{dupProgress.total}
            {dupProgress.name ? ` · ${dupProgress.name}` : ""}
          </div>
        )}
        {connected && detailView !== "terminal" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {detailView === "config" ? (
              <ConfigEditor
                projectName={project}
                remoteSource={remoteConfigSource}
                onSaved={() => refreshGit()}
                onBack={() => setDetailView("terminal")}
                onToggleView={() => setDetailView("terminal")}
                isRemote
              />
            ) : detailView === "ai" ? (
              <ProjectAIInstructions
                projectName={project}
                onBack={() => setDetailView("terminal")}
                read={remoteInstructions.read}
                write={remoteInstructions.write}
              />
            ) : detailView === "notes" ? (
              <NotesView
                projectName={project}
                visible={detailView === "notes"}
                commands={remoteNotesCommands}
              />
            ) : null}
          </div>
        ) : (
          <>
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
            onSummary={(s) =>
              setGit({
                isRepo: s.isRepo,
                branch: s.branch,
                changed: s.files.length,
              })
            }
          />
        ) : terminals.length === 0 && services.length === 0 ? (
          <EmptyTerminalState
            projectName={project}
            hideEditConfig
            onNewTerminal={() => send({ t: "newTerminal", project })}
            onEditConfig={() => {}}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]">
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--terminal-header)] px-1.5 py-1">
              {hasMultipleServices && (
                <HeaderTab
                  label="All"
                  icon={<ZapIcon />}
                  active={activeId === SVC_ALL}
                  onClick={() => openService(SVC_ALL)}
                />
              )}
              {services.map((svc) => (
                <HeaderTab
                  key={`svc:${svc.paneIndex}`}
                  label={svc.name}
                  icon={<ZapIcon />}
                  active={activeId === svcId(svc.paneIndex as number)}
                  onClick={() => openService(svcId(svc.paneIndex as number))}
                  trailing={
                    svc.port ? (
                      <span className="font-mono text-[10px] tabular-nums opacity-60">
                        :{svc.port}
                      </span>
                    ) : undefined
                  }
                />
              ))}
              {terminals.length > 1 && (
                <HeaderTab
                  label="All"
                  active={activeId === ALL}
                  onClick={() => openTab(ALL)}
                />
              )}
              <RemoteTerminalTabs
                terminals={terminals}
                activeId={activeId}
                ports={ports}
                onOpen={openTab}
                onClose={closeTab}
                onRename={renameTab}
                onTogglePin={(id) => send({ t: "pinTerminal", project, id })}
                onReorder={(order) =>
                  send({ t: "reorderTerminals", project, order })
                }
                tabState={tabState}
              />
              <button
                onClick={() => send({ t: "newTerminal", project })}
                title="New terminal"
                className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <PlusIcon />
              </button>
              {terminals.length > 1 &&
                !activeId.startsWith("svc:") &&
                activeId !== SVC_ALL && (
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <IconBtn
                      onClick={() => {
                        setShowChanges(false);
                        setPanes((v) => !v);
                      }}
                      active={panes}
                      title={panes ? "Single view" : "Split view"}
                    >
                      <SplitRightIcon />
                    </IconBtn>
                  </div>
                )}
            </div>

            {activeId === SVC_ALL ? (
              <div
                className="grid min-h-0 flex-1 gap-1 overflow-auto p-1"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))",
                }}
              >
                {services.map((svc) => (
                  <div
                    key={svc.paneIndex}
                    className="min-h-[16rem] overflow-hidden rounded border border-[var(--border)]"
                  >
                    <RemoteServiceLog
                      peerId={peerId}
                      project={project}
                      paneIndex={svc.paneIndex as number}
                      name={svc.name}
                    />
                  </div>
                ))}
              </div>
            ) : activeId.startsWith("svc:") ? (
              (() => {
                const idx = Number(activeId.slice(4));
                const svc = services.find((s) => s.paneIndex === idx);
                return svc ? (
                  <RemoteServiceLog
                    peerId={peerId}
                    project={project}
                    paneIndex={idx}
                    name={svc.name}
                  />
                ) : null;
              })()
            ) : panes ? (
              <RemotePaneLayout
                peerId={peerId}
                terminals={terminals}
                initialTerminalId={active?.id ?? terminals[0]?.id ?? null}
              />
            ) : activeId === ALL ? (
              <div
                className="grid min-h-0 flex-1 gap-1 overflow-auto p-1"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))",
                }}
              >
                {terminals.map((t) => (
                  <div
                    key={t.id}
                    className="min-h-[16rem] overflow-hidden rounded border border-[var(--border)]"
                  >
                    <RemoteTerminalMirror peerId={peerId} terminal={t} />
                  </div>
                ))}
              </div>
            ) : active ? (
              <>
                <RemoteTerminalMirror
                  key={`${peerId}:${active.id}`}
                  peerId={peerId}
                  terminal={active}
                />
                <TerminalComposer
                  key={`composer:${peerId}:${active.id}`}
                  remote
                  remoteSource={remoteComposerSource ?? undefined}
                  remoteHistorySource={remoteHistorySource}
                  terminalId={active.id}
                  historyKey={active.id}
                  projectName={project}
                  shown
                  focused
                  targetLabel={active.label}
                  terminals={[]}
                  cwd=""
                  fontSize={COMPOSER_FONT_SIZE}
                  onSubmit={makeSubmit(active)}
                  onFocusTerminal={() => {}}
                  onRunInDuplicates={runInDuplicates}
                />
              </>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-2 bg-[var(--terminal-bg)] px-2 py-1">
          <AppTip />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
            {connected &&
              footerActions.map((a) => (
                <ActionView
                  key={a.name}
                  action={a}
                  compact
                  disabled={false}
                  onRun={runAction}
                />
              ))}
            {git.isRepo && (
              <>
                <RemoteBranchMenu
                  peerId={peerId}
                  project={project}
                  branch={git.branch}
                  changed={git.changed}
                  onSwitched={refreshGit}
                />
                <RemoteCommitButton
                  peerId={peerId}
                  project={project}
                  changed={git.changed}
                  onOpen={() => setShowChanges((v) => !v)}
                  onDone={refreshGit}
                  onCreatePr={() => setPrOpen(true)}
                  onDiscardAll={discardAll}
                />
              </>
            )}
          </div>
        </div>
          </>
        )}
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
          if (renaming)
            send({
              t: "renameTerminal",
              project,
              id: renaming.id,
              label: value,
            });
        }}
      />
      <RemotePRModal
        open={prOpen}
        peerId={peerId}
        project={project}
        onClose={() => setPrOpen(false)}
        onCreated={refreshGit}
      />
      {dupDialog && (
        <BulkDuplicateDialog
          key={duplicateNonce}
          open
          project={(projectInfo as unknown as ProjectInfo | null) ?? null}
          folderNames={[]}
          seed={dupDialog.seed ?? undefined}
          defaultsOverride={dupDefaults ?? undefined}
          onCancel={cancelDuplicate}
          onConfirm={confirmDuplicate}
        />
      )}
      {inputsAction && (
        <ActionInputsModal
          projectName={project}
          action={inputsAction}
          onCancel={() => setInputsAction(null)}
          onSubmit={(values) => {
            const a = inputsAction;
            setInputsAction(null);
            if (!a) return;
            if (a.confirm) confirmRunAction(a, values);
            else sendRunAction(a, values);
          }}
        />
      )}
    </div>
  );
}

// A compact header toggle for a mirrored detail view (config / notes / AI), lit
// while its view fills the body.
function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
