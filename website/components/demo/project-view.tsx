"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Folder, Globe, Terminal } from "lucide-react";
import type {
  DemoAction,
  DemoBranch,
  DemoGit,
  DemoProject,
} from "./projects";
import { FilesView } from "./files-view";
import { PaneHeader, type PaneActionsProps, type TabInfo } from "./pane-header";
import type { UtilityTabKind } from "./pane-action-meta";
import type { PaneActionId } from "./pane-actions";
import { usePaneToolbar } from "./use-pane-toolbar";
import { resolveUtilityTabAction } from "./utility-tab";
import { ServiceLabelBar, StreamingOutput } from "./terminal-pane";
import { DemoActionModal } from "./action-modal";
import { DemoAddActionModal, type NewActionInput } from "./add-action-modal";
import { agentDriveKey } from "./agent-drive";
import {
  AgentTerminal,
  type AgentStatus,
  type AgentTurnTiming,
} from "./agent-terminal";
import { BrowserView } from "./browser-view";
import { InteractiveTerminal } from "./interactive-terminal";
import { ProjectHeader } from "./project-header";
import { DemoBranchSwitcher } from "./branch-switcher";
import { TabContextMenu, TabRenameModal } from "./tab-controls";
import { AppTip } from "./app-tip";
import { ReviewView } from "./review-view";
import { actionButtonStyle } from "./action-colors";
import { FOCUS_RING, PRESS } from "./ui";
import {
  type LeafContent,
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
  type SplitDirection,
  activateTabByKey,
  addTabToLeaf,
  appendLeaf,
  collectLeaves,
  closeTabInLeaf,
  defaultLabel,
  findLeaf,
  isServiceTab,
  makeLeaf,
  newBrowserContent,
  newFilesContent,
  newReviewContent,
  newShellContent,
  removeLeaf,
  setActiveTab,
  setRatioAtPath,
  splitAtLeaf,
  syncServiceTabs,
  tabKey,
  updateTabInLeaf,
} from "./pane-tree";

export type ActionTerminalMap = Record<string, DemoAction>;

// Keyed by tab key, which encodes no human-readable name — the label rides
// along so views like Activity can title a row without parsing the key.
export type AgentTabState = {
  label: string;
  status: AgentStatus;
  // When the turn on this tab started, and when it landed. A turn still in
  // flight has no `until`, so its row counts up.
  since?: number;
  until?: number;
};

// The workspace lives in DemoApp, keyed by project, so switching projects and
// back doesn't wipe panes the header still reports as running.
export function initialPaneState(project: DemoProject): {
  tree: PaneNode | null;
  actionTerminals: ActionTerminalMap;
} {
  const autoAction = project.autoStart
    ? project.actions.find((a) => a.name === project.autoStart)
    : undefined;
  if (!autoAction) return { tree: null, actionTerminals: {} };
  const autoKey = `${autoAction.name}-auto`;
  return {
    tree: makeLeaf({
      kind: "action",
      key: autoKey,
      label: autoAction.label,
      ...(autoAction.emoji ? { emoji: autoAction.emoji } : {}),
    }),
    actionTerminals: { [autoKey]: autoAction },
  };
}

type ProjectViewProps = {
  project: DemoProject;
  runningServices: Set<string>;
  tree: PaneNode | null;
  setTree: React.Dispatch<React.SetStateAction<PaneNode | null>>;
  actionTerminals: ActionTerminalMap;
  setActionTerminals: React.Dispatch<React.SetStateAction<ActionTerminalMap>>;
  agentTabStatus: Record<string, AgentTabState>;
  setAgentTabStatus: React.Dispatch<
    React.SetStateAction<Record<string, AgentTabState>>
  >;
  onStartServices: (names: string[]) => void;
  onStopAll: () => void;
  onToggleService: (name: string) => void;
  git?: DemoGit;
  onGitCheckout: (branch: DemoBranch) => void;
  onGitCommit: () => void;
  onGitPull: () => void;
  onGitPush: () => void;
  onGitFetch: () => void;
  onGitMerge: (branch: string) => void;
  onGitCreatePR: () => void;
  onGitDiscard: () => void;
  onGitSync: () => void;
  onGitCreateBranch: (name: string) => void;
  onGitRenameBranch: (oldName: string, newName: string) => void;
  onGitDeleteBranch: (name: string) => void;
  onGitRemoveRemote: (branch: DemoBranch) => void;
  onAddAction: (input: NewActionInput) => void;
  // The opening tour mimes clicks on Start and then on the agent action, so it
  // needs a handle on both buttons; only the visible project gets them.
  startButtonRef?: React.Ref<HTMLButtonElement>;
  agentButtonRef?: React.RefObject<HTMLButtonElement | null>;
  codexButtonRef?: React.RefObject<HTMLButtonElement | null>;
  startRingPulse?: boolean;
};

export function DemoProjectView({
  project,
  runningServices,
  tree,
  setTree,
  actionTerminals,
  setActionTerminals,
  agentTabStatus,
  setAgentTabStatus,
  onStartServices,
  onStopAll,
  onToggleService,
  git,
  onGitCheckout,
  onGitCommit,
  onGitPull,
  onGitPush,
  onGitFetch,
  onGitMerge,
  onGitCreatePR,
  onGitDiscard,
  onGitSync,
  onGitCreateBranch,
  onGitRenameBranch,
  onGitDeleteBranch,
  onGitRemoveRemote,
  onAddAction,
  startButtonRef,
  agentButtonRef,
  codexButtonRef,
  startRingPulse,
}: ProjectViewProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const handleAgentStatus = (
    tabKey: string,
    label: string,
    status: AgentStatus,
    timing?: AgentTurnTiming,
  ) => {
    setAgentTabStatus((prev) => ({
      ...prev,
      [tabKey]: { label, status, since: timing?.since, until: timing?.until },
    }));
  };
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState<SplitDirection>("row");
  const [tabMenu, setTabMenu] = useState<{
    leafId: string;
    tabIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    leafId: string;
    tabIdx: number;
  } | null>(null);
  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null);
  const [fullscreenLeafId, setFullscreenLeafId] = useState<string | null>(null);
  // Where each pane's utility toggle was pressed from, by `${leafId}:${kind}`.
  const utilityReturns = useRef<Map<string, string>>(new Map());
  const paneToolbar = usePaneToolbar();
  // Each pane's bodies are portaled into a host element this view owns, not
  // into the pane's own div. Splitting rebuilds the pane, and a portal whose
  // container changes remounts its children — the host survives instead and is
  // simply moved into whichever pane now shows it.
  const hostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [paneSlots, setPaneSlots] = useState<Record<string, HTMLElement>>({});
  const registerSlot = useCallback((leafId: string, el: HTMLElement | null) => {
    if (el === null) return;
    let host = hostsRef.current.get(leafId);
    if (!host) {
      host = document.createElement("div");
      host.style.position = "absolute";
      host.style.inset = "0";
      hostsRef.current.set(leafId, host);
      const created = host;
      setPaneSlots((prev) => ({ ...prev, [leafId]: created }));
    }
    if (host.parentNode !== el) el.appendChild(host);
  }, []);
  const closeStart = useCallback(() => setStartOpen(false), []);

  useEffect(() => {
    if (!fullscreenLeafId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setFullscreenLeafId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenLeafId]);

  useEffect(() => {
    if (!isResizing) return;
    const body = document.body;
    const prevCursor = body.style.cursor;
    const prevSelect = body.style.userSelect;
    body.style.cursor = resizeDir === "row" ? "col-resize" : "row-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = prevCursor;
      body.style.userSelect = prevSelect;
    };
  }, [isResizing, resizeDir]);

  const anyRunning = runningServices.size > 0;
  const headerActions = project.actions.filter((a) => a.display === "header");
  const footerActions = project.actions.filter((a) => a.display === "footer");

  const openAction = (a: DemoAction) => {
    if (a.type === "terminal") openActionTerminal(a);
    else setRunningAction(a);
  };

  const openNewPaneWithShell = () => {
    setTree((prev) => appendLeaf(prev, makeLeaf(newShellContent(prev))));
  };

  const openNewPaneWithBrowser = () => {
    setTree((prev) => appendLeaf(prev, makeLeaf(newBrowserContent())));
  };

  const openNewPaneWithFiles = () => {
    setTree((prev) => appendLeaf(prev, makeLeaf(newFilesContent())));
  };

  const addTerminalToLeaf = (leafId: string) => {
    setTree((prev) =>
      prev ? addTabToLeaf(prev, leafId, newShellContent(prev)) : prev,
    );
  };

  const addBrowserToLeaf = (leafId: string, url?: string) => {
    setTree((prev) =>
      prev ? addTabToLeaf(prev, leafId, newBrowserContent(url)) : prev,
    );
  };

  const addReviewToLeaf = (leafId: string) => {
    setTree((prev) => (prev ? addTabToLeaf(prev, leafId, newReviewContent()) : prev));
  };

  const addFilesToLeaf = (leafId: string) => {
    setTree((prev) => (prev ? addTabToLeaf(prev, leafId, newFilesContent()) : prev));
  };

  // A toolbar button both shows its tab and dismisses it; dismissing returns to
  // whatever the visitor was reading when they pressed it.
  const toggleUtilityInLeaf = (leafId: string, kind: UtilityTabKind) => {
    const leaf = tree ? findLeaf(tree, leafId) : null;
    if (!leaf) return;
    const key = `${leafId}:${kind}`;
    const resolved = resolveUtilityTabAction(
      leaf,
      kind,
      utilityReturns.current.get(key) ?? null,
    );
    if (resolved.action === "open") {
      if (resolved.remember) utilityReturns.current.set(key, resolved.remember);
      else utilityReturns.current.delete(key);
      const existing = leaf.tabs.findIndex((tab) => tab.kind === kind);
      if (existing >= 0) handleSelectTab(leafId, existing);
      else if (kind === "files") addFilesToLeaf(leafId);
      else addReviewToLeaf(leafId);
      return;
    }
    utilityReturns.current.delete(key);
    handleCloseTab(leafId, resolved.tabIdx);
    // The close renumbers the tabs, so the return trip has to be made against
    // the tree the close produced rather than the one it was read from.
    const back = resolved.back;
    if (back) setTree((prev) => activateTabByKey(prev, back));
  };

  const runPaneAction = (leafId: string, id: PaneActionId, fromToolbar: boolean) => {
    if (id === "browser") return addBrowserToLeaf(leafId);
    if (!fromToolbar) {
      if (id === "files") return addFilesToLeaf(leafId);
      return addReviewToLeaf(leafId);
    }
    toggleUtilityInLeaf(leafId, id);
  };

  const openActionTerminal = (action: DemoAction) => {
    const key = `${action.name}-${Date.now().toString(36)}`;
    setActionTerminals((prev) => ({ ...prev, [key]: action }));
    const content: LeafContent = {
      kind: "action",
      key,
      label: action.label,
      ...(action.emoji ? { emoji: action.emoji } : {}),
    };
    // Actions open as a new tab in the existing pane, never as a new split.
    setTree((prev) => {
      if (!prev) return makeLeaf(content);
      const leaves = collectLeaves(prev);
      const target = leaves[leaves.length - 1];
      return addTabToLeaf(prev, target.id, content);
    });
  };

  const handleTabContextMenu = (
    leafId: string,
    tabIdx: number,
    x: number,
    y: number,
  ) => {
    setTabMenu({ leafId, tabIdx, x, y });
  };

  const handleRenameTab = (
    leafId: string,
    tabIdx: number,
    label: string,
    emoji?: string,
  ) => {
    setTree((prev) =>
      prev
        ? updateTabInLeaf(prev, leafId, tabIdx, (t) =>
            isServiceTab(t)
              ? t
              : t.kind === "browser"
                ? { ...t, label }
                : { ...t, label, emoji: emoji || undefined },
          )
        : prev,
    );
  };

  const handleTogglePin = (leafId: string, tabIdx: number) => {
    setTree((prev) =>
      prev
        ? updateTabInLeaf(prev, leafId, tabIdx, (t) =>
            isServiceTab(t) ? t : { ...t, pinned: !t.pinned },
          )
        : prev,
    );
  };

  const handleGitCheckout = (b: DemoBranch) => {
    onGitCheckout(b);
  };

  const handleGitCommit = () => {
    if (!git || git.uncommitted === 0) return;
    onGitCommit();
  };

  const handleGitPull = () => {
    onGitPull();
  };

  const handleGitPush = () => {
    onGitPush();
  };

  const handleGitFetch = () => {
    onGitFetch();
  };

  const handleGitMerge = (branch: string) => {
    onGitMerge(branch);
  };

  const handleGitCreatePR = () => {
    onGitCreatePR();
  };

  const handleGitDiscard = () => {
    if (!git || git.uncommitted === 0) return;
    onGitDiscard();
  };

  const handleGitSync = () => {
    if (!git) return;
    onGitSync();
  };

  const handleGitCreateBranch = (name: string) => {
    onGitCreateBranch(name);
  };

  const handleGitCopyBranchName = (name: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(name).catch(() => {});
    }
  };

  const handleSplit = (paneId: string, direction: SplitDirection) => {
    if (!tree) return;
    const leaf = makeLeaf(newShellContent(tree));
    setFocusedLeafId(leaf.id);
    setTree((prev) => (prev ? splitAtLeaf(prev, paneId, direction, leaf) : prev));
  };

  // Keeps the tab strip and the running set in step: the service tabs are
  // rebuilt from whatever is running once the toggle lands.
  const applyServicesToTree = (names: string[]) => {
    const ordered = project.services
      .map((s) => s.name)
      .filter((n) => names.includes(n));
    setTree((prev) => syncServiceTabs(prev, ordered));
  };

  const handleToggleService = (name: string) => {
    onToggleService(name);
    const next = new Set(runningServices);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    applyServicesToTree([...next]);
  };

  const handleCloseTab = (leafId: string, tabIdx: number) => {
    const leaf = tree ? findLeaf(tree, leafId) : null;
    const tab = leaf?.tabs[tabIdx];
    if (!tab || tab.kind === "all") return;
    if (tab.kind === "service") {
      handleToggleService(tab.name);
      return;
    }
    if (tab.kind === "action") {
      const key = tab.key;
      setActionTerminals((map) => {
        if (!(key in map)) return map;
        const next = { ...map };
        delete next[key];
        return next;
      });
      // Otherwise Activity keeps listing an agent whose tab is gone.
      const statusKey = tabKey(tab);
      setAgentTabStatus((prev) => {
        if (!(statusKey in prev)) return prev;
        const next = { ...prev };
        delete next[statusKey];
        return next;
      });
    }
    setTree((prev) => (prev ? closeTabInLeaf(prev, leafId, tabIdx) : prev));
  };

  const handleClosePane = (leafId: string) => {
    setTree((prev) => (prev ? removeLeaf(prev, leafId) : prev));
    setFocusedLeafId((id) => (id === leafId ? null : id));
    setFullscreenLeafId((id) => (id === leafId ? null : id));
  };

  const handleToggleFullscreen = (leafId: string) => {
    setFullscreenLeafId((id) => (id === leafId ? null : leafId));
  };

  const handleSelectTab = (leafId: string, tabIdx: number) => {
    setTree((prev) => (prev ? setActiveTab(prev, leafId, tabIdx) : prev));
  };

  const handleRatioChange = useCallback(
    (path: number[], ratio: number) => {
      setTree((prev) => (prev ? setRatioAtPath(prev, path, ratio) : prev));
    },
    [setTree],
  );

  const handleResizeStart = useCallback((dir: SplitDirection) => {
    setResizeDir(dir);
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleStartStop = () => {
    if (anyRunning) {
      onStopAll();
      applyServicesToTree([]);
    } else {
      const defaultProfile = project.profiles.find((p) => p.name === "default");
      const names = defaultProfile
        ? defaultProfile.services
        : project.services.map((s) => s.name);
      onStartServices(names);
      applyServicesToTree(names);
    }
  };

  const handleStartProfile = (profile: string) => {
    const p = project.profiles.find((x) => x.name === profile);
    if (!p) return;
    onStartServices(p.services);
    applyServicesToTree(p.services);
    setStartOpen(false);
  };

  // A pane only reads as "focused" once there is another pane to contrast it
  // with, which is the same gate the app puts on its underline.
  const leaves = collectLeaves(tree);
  const focusedPaneId = leaves.length > 1 ? focusedLeafId ?? leaves[0].id : null;

  // A pane can go away without passing through handleClosePane — closing its
  // last tab removes it — so the fullscreen id is only honoured while the pane
  // it names is still in the tree.
  const fullscreenPaneId =
    fullscreenLeafId && tree && findLeaf(tree, fullscreenLeafId) ? fullscreenLeafId : null;

  const leafCtx: LeafContext = {
    project,
    git,
    runningServices,
    actionTerminals,
    agentTabStatus,
    onAgentTabStatus: handleAgentStatus,
  };

  return (
    <div className="relative flex flex-1 min-w-0 min-h-0 flex-col bg-[#1a1a1a]">
      <ProjectHeader
        project={project}
        anyRunning={anyRunning}
        headerActions={headerActions}
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((v) => !v)}
        onCloseStart={closeStart}
        onStartStop={handleStartStop}
        onStartProfile={handleStartProfile}
        onToggleService={handleToggleService}
        onOpenAction={openAction}
        onAddAction={() => {
          setStartOpen(false);
          setAddingAction(true);
        }}
        runningServices={runningServices}
        startButtonRef={startButtonRef}
        agentButtonRef={agentButtonRef}
        codexButtonRef={codexButtonRef}
        startRingPulse={startRingPulse}
      />

      {tree ? (
        <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden border-t border-[#2e2e2e]">
          <PaneLayout
            node={tree}
            path={[]}
            project={project}
            runningServices={runningServices}
            actionTerminals={actionTerminals}
            onSplit={handleSplit}
            onCloseTab={handleCloseTab}
            onSelectTab={handleSelectTab}
            onNewTab={addTerminalToLeaf}
            onNewBrowser={addBrowserToLeaf}
            onPaneAction={runPaneAction}
            paneToolbar={paneToolbar}
            fullscreenLeafId={fullscreenPaneId}
            onToggleFullscreen={handleToggleFullscreen}
            onTabContextMenu={handleTabContextMenu}
            onRatioChange={handleRatioChange}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            agentTabStatus={agentTabStatus}
            onAgentTabStatus={handleAgentStatus}
            focusedLeafId={focusedPaneId}
            onFocusPane={setFocusedLeafId}
            onClosePane={leaves.length > 1 ? handleClosePane : undefined}
            registerSlot={registerSlot}
          />
          {/* Mounted once per leaf, for the life of that leaf, and portaled
              into the slot its pane exposes. */}
          {leaves.map((leaf) => (
            <LeafBodies
              key={leaf.id}
              leaf={leaf}
              ctx={leafCtx}
              target={paneSlots[leaf.id] ?? null}
              onSelectTab={handleSelectTab}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          projectName={project.name}
          onOpenTerminal={openNewPaneWithShell}
          onOpenBrowser={openNewPaneWithBrowser}
          onOpenFiles={openNewPaneWithFiles}
        />
      )}

      {/* Outside the tree guard: the footer must not pop in and shove the
          workspace up the moment the first pane appears. */}
      <div className="flex shrink-0 items-center gap-2 bg-[#1a1a1a] px-3 py-2">
        <AppTip />
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
          {footerActions.map((a) => (
            <FooterActionButton key={a.name} action={a} onRun={() => openAction(a)} />
          ))}
          {git && (
            <DemoBranchSwitcher
              git={git}
              onCheckout={handleGitCheckout}
              onCommit={handleGitCommit}
              onPull={handleGitPull}
              onPush={handleGitPush}
              onFetch={handleGitFetch}
              onMerge={handleGitMerge}
              onCreatePR={handleGitCreatePR}
              onDiscard={handleGitDiscard}
              onSync={handleGitSync}
              onCreateBranch={handleGitCreateBranch}
              onRenameBranch={onGitRenameBranch}
              onDeleteBranch={onGitDeleteBranch}
              onRemoveRemote={onGitRemoveRemote}
              onCopyBranchName={handleGitCopyBranchName}
            />
          )}
        </div>
      </div>

      {runningAction && (
        <DemoActionModal
          action={runningAction}
          onClose={() => setRunningAction(null)}
        />
      )}

      <DemoAddActionModal
        open={addingAction}
        onClose={() => setAddingAction(false)}
        onCreate={(input) => {
          onAddAction(input);
          setAddingAction(false);
        }}
      />

      {tabMenu && (() => {
        const leaf = tree ? findLeaf(tree, tabMenu.leafId) : null;
        const tab = leaf?.tabs[tabMenu.tabIdx];
        if (!tab || isServiceTab(tab)) return null;
        const pinned = tab.pinned === true;
        return (
          <TabContextMenu
            x={tabMenu.x}
            y={tabMenu.y}
            pinned={pinned}
            onRename={() =>
              setRenaming({ leafId: tabMenu.leafId, tabIdx: tabMenu.tabIdx })
            }
            onTogglePin={() => handleTogglePin(tabMenu.leafId, tabMenu.tabIdx)}
            onCloseTab={() => handleCloseTab(tabMenu.leafId, tabMenu.tabIdx)}
            onDismiss={() => setTabMenu(null)}
          />
        );
      })()}

      {renaming && (() => {
        const leaf = tree ? findLeaf(tree, renaming.leafId) : null;
        const tab = leaf?.tabs[renaming.tabIdx];
        if (!tab || isServiceTab(tab)) return null;
        const hasEmoji = tab.kind === "shell" || tab.kind === "action";
        const initialLabel =
          tab.kind === "review" ? defaultLabel(tab) : tab.label ?? defaultLabel(tab);

        return (
          <TabRenameModal
            open
            withEmoji={hasEmoji}
            initialValue={initialLabel}
            initialEmoji={hasEmoji ? tab.emoji ?? "" : ""}
            onClose={() => setRenaming(null)}
            onSubmit={(value, emoji) =>
              handleRenameTab(renaming.leafId, renaming.tabIdx, value, emoji)
            }
          />
        );
      })()}
    </div>
  );
}

type PaneLayoutProps = {
  node: PaneNode;
  path: number[];
  project: DemoProject;
  runningServices: Set<string>;
  actionTerminals: ActionTerminalMap;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onCloseTab: (leafId: string, tabIdx: number) => void;
  onSelectTab: (leafId: string, tabIdx: number) => void;
  onNewTab: (leafId: string) => void;
  onNewBrowser: (leafId: string, url?: string) => void;
  onPaneAction: (leafId: string, id: PaneActionId, fromToolbar: boolean) => void;
  paneToolbar: ReturnType<typeof usePaneToolbar>;
  fullscreenLeafId: string | null;
  onToggleFullscreen: (leafId: string) => void;
  onTabContextMenu: (leafId: string, tabIdx: number, x: number, y: number) => void;
  onRatioChange: (path: number[], ratio: number) => void;
  onResizeStart: (dir: SplitDirection) => void;
  onResizeEnd: () => void;
  agentTabStatus: Record<string, AgentTabState>;
  onAgentTabStatus: (
    tabKey: string,
    label: string,
    status: AgentStatus,
    timing?: AgentTurnTiming,
  ) => void;
  focusedLeafId: string | null;
  onFocusPane: (leafId: string) => void;
  onClosePane?: (leafId: string) => void;
  /** Where a leaf hands back the element its bodies get portaled into. */
  registerSlot: (leafId: string, el: HTMLElement | null) => void;
};

function PaneLayout(props: PaneLayoutProps) {
  if (props.node.kind === "leaf") return <Leaf {...props} leaf={props.node} />;
  return <SplitView {...props} split={props.node} />;
}

type LeafContext = {
  project: DemoProject;
  // Live git, not `project.git`: the seed goes stale the moment the visitor
  // commits, and a Review tab or a shell that disagrees with the branch pill
  // is worse than no Review tab at all.
  git?: DemoGit;
  runningServices: Set<string>;
  actionTerminals: ActionTerminalMap;
  agentTabStatus: Record<string, AgentTabState>;
  onAgentTabStatus: (
    tabKey: string,
    label: string,
    status: AgentStatus,
    timing?: AgentTurnTiming,
  ) => void;
};

type ResolvedTab = {
  info: TabInfo;
  body: ReactNode;
};

function resolveTab(tab: LeafContent, ctx: LeafContext): ResolvedTab {
  const key = tabKey(tab);
  // The aggregate has no body of its own — Leaf tiles the service logs, which
  // stay mounted so switching between All and a single service never restarts
  // the stream.
  if (tab.kind === "all") {
    return {
      info: { key, label: "All", type: "all", running: true, closable: false },
      body: null,
    };
  }
  if (tab.kind === "service") {
    const svc = ctx.project.services.find((s) => s.name === tab.name);
    return {
      info: {
        key,
        label: svc?.name ?? tab.name,
        type: "service",
        port: svc?.port,
        running: ctx.runningServices.has(tab.name),
      },
      body: svc ? (
        <StreamingOutput
          key={`${ctx.project.name}:${svc.name}`}
          output={svc.output}
          loop={svc.loop}
        />
      ) : null,
    };
  }
  if (tab.kind === "shell") {
    return {
      info: {
        key,
        label: tab.label ?? defaultLabel(tab),
        type: "terminal",
        running: true,
        emoji: tab.emoji,
        pinned: tab.pinned,
      },
      body: (
        <InteractiveTerminal
          key={tab.id}
          projectRoot={ctx.project.root}
          projectName={ctx.project.name}
          git={ctx.git}
          changedFiles={ctx.project.changedFiles}
        />
      ),
    };
  }
  if (tab.kind === "browser") {
    return {
      info: {
        key,
        label: tab.label ?? defaultLabel(tab),
        type: "browser",
        running: true,
        pinned: tab.pinned,
      },
      body: (
        <BrowserView
          key={tab.id}
          project={ctx.project}
          runningServices={ctx.runningServices}
          initialUrl={tab.url}
        />
      ),
    };
  }
  if (tab.kind === "review") {
    return {
      info: {
        key,
        label: defaultLabel(tab),
        type: "review",
        running: true,
        pinned: tab.pinned,
      },
      body: <ReviewView key={tab.id} project={ctx.project} git={ctx.git} />,
    };
  }
  if (tab.kind === "files") {
    return {
      info: {
        key,
        label: tab.label ?? defaultLabel(tab),
        type: "files",
        running: true,
        pinned: tab.pinned,
      },
      body: <FilesView key={tab.id} project={ctx.project} git={ctx.git} />,
    };
  }
  const action = ctx.actionTerminals[tab.key];
  const info: TabInfo = {
    key,
    label: tab.label,
    type: "terminal",
    running: true,
    emoji: tab.emoji,
    pinned: tab.pinned,
    status: action?.agent ? ctx.agentTabStatus[key]?.status : undefined,
  };
  if (!action) return { info, body: null };
  return {
    info,
    body: action.agent ? (
      <AgentTerminal
        key={tab.key}
        agent={action.agent}
        cwd={ctx.project.root}
        replyContext={ctx.project.replyContext}
        autoPrompt={action.autoPrompt}
        autoMode={action.autoMode}
        autoSteps={action.autoSteps}
        autoIntent={action.autoIntent}
        autoAnswerSteps={action.autoAnswerSteps}
        autoDeferred={action.autoDeferred}
        driveKey={agentDriveKey(ctx.project.name, action.agent)}
        onStatus={(status, timing) =>
          ctx.onAgentTabStatus(key, tab.label, status, timing)
        }
      />
    ) : (
      <StreamingOutput key={tab.key} output={action.output} loop={action.loop} />
    ),
  };
}

function Leaf({
  leaf,
  project,
  runningServices,
  actionTerminals,
  onSplit,
  onCloseTab,
  onSelectTab,
  onNewTab,
  onNewBrowser,
  onPaneAction,
  paneToolbar,
  fullscreenLeafId,
  onToggleFullscreen,
  onTabContextMenu,
  agentTabStatus,
  onAgentTabStatus,
  focusedLeafId,
  onFocusPane,
  onClosePane,
  registerSlot,
}: PaneLayoutProps & { leaf: PaneLeaf }) {
  const ctx: LeafContext = {
    project,
    runningServices,
    actionTerminals,
    agentTabStatus,
    onAgentTabStatus,
  };
  const resolved = leaf.tabs.map((tab) => resolveTab(tab, ctx));
  const active = leaf.tabs[leaf.activeTabIdx];
  const activeUtilityTab: UtilityTabKind | null =
    active?.kind === "review" || active?.kind === "files" ? active.kind : null;
  const paneActions: PaneActionsProps = {
    menu: paneToolbar.menu,
    toolbar: paneToolbar.toolbar,
    isDefault: paneToolbar.isDefault,
    activeTab: activeUtilityTab,
    onRun: (id, fromToolbar) => onPaneAction(leaf.id, id, fromToolbar),
    onMove: paneToolbar.move,
    onReset: paneToolbar.reset,
  };
  const fullscreen = fullscreenLeafId === leaf.id;
  return (
    <div
      onMouseDownCapture={() => onFocusPane(leaf.id)}
      className={
        fullscreen
          ? "absolute inset-0 z-30 flex flex-col overflow-hidden bg-[#1a1a1a]"
          : "flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-x border-t border-[#2e2e2e]"
      }
    >
      <PaneHeader
        focused={focusedLeafId === leaf.id}
        tabs={resolved.map((r) => r.info)}
        activeIdx={leaf.activeTabIdx}
        onSelectTab={(i) => onSelectTab(leaf.id, i)}
        onCloseTab={(i) => onCloseTab(leaf.id, i)}
        onNewTab={() => onNewTab(leaf.id)}
        onOpenPort={(port) =>
          onNewBrowser(leaf.id, `http://localhost:${port}`)
        }
        onTabContextMenu={(i, x, y) => onTabContextMenu(leaf.id, i, x, y)}
        onSplitRight={() => onSplit(leaf.id, "row")}
        onSplitDown={() => onSplit(leaf.id, "col")}
        paneActions={paneActions}
        fullscreen={fullscreen}
        onToggleFullscreen={() => onToggleFullscreen(leaf.id)}
        onClosePane={onClosePane ? () => onClosePane(leaf.id) : undefined}
      />
      {/* Only a slot: the bodies are mounted once, outside the tree, and
          portaled in here. Splitting a pane turns this Leaf into a SplitView,
          which unmounts everything below it — with the sessions rendered here
          that would restart the agent mid-turn and wipe the logs. */}
      <div
        ref={(el) => registerSlot(leaf.id, el)}
        className="relative flex-1 min-h-0"
      />
    </div>
  );
}

/** Every tab body in one leaf, mounted for the life of that leaf and shown or
 *  hidden by CSS. Rendered outside the pane tree and portaled into the leaf's
 *  slot, so restructuring the tree never remounts a session. */
function LeafBodies({
  leaf,
  ctx,
  target,
  onSelectTab,
}: {
  leaf: PaneLeaf;
  ctx: LeafContext;
  target: HTMLElement | null;
  onSelectTab: (leafId: string, idx: number) => void;
}) {
  const resolved = leaf.tabs.map((tab) => resolveTab(tab, ctx));
  const serviceIdxs = leaf.tabs.flatMap((t, i) =>
    t.kind === "service" ? [i] : [],
  );
  const allActive = leaf.tabs[leaf.activeTabIdx]?.kind === "all";
  const servicesVisible = allActive || serviceIdxs.includes(leaf.activeTabIdx);
  if (!target) return null;
  return createPortal(
    <>
      {serviceIdxs.length > 0 && (
        <div
          className={`absolute inset-0 ${servicesVisible ? "flex" : "hidden"} ${
            allActive ? "divide-x divide-[#2e2e2e]" : ""
          }`}
        >
          {serviceIdxs.map((i) => {
            const { info, body } = resolved[i];
            const visible = allActive || i === leaf.activeTabIdx;
            return (
              <div
                key={info.key}
                className={
                  visible
                    ? `flex min-h-0 flex-1 flex-col overflow-hidden ${
                        allActive ? "min-w-32" : "min-w-0"
                      }`
                    : "hidden"
                }
              >
                {allActive && (
                  <ServiceLabelBar
                    label={info.label}
                    onClick={() => onSelectTab(leaf.id, i)}
                  />
                )}
                {body}
              </div>
            );
          })}
        </div>
      )}
      {resolved.map(({ info, body }, i) =>
        isServiceTab(leaf.tabs[i]) ? null : (
          <div
            key={info.key}
            className={`absolute inset-0 flex-col ${
              i === leaf.activeTabIdx ? "flex" : "hidden"
            }`}
          >
            {body}
          </div>
        ),
      )}
    </>,
    target,
  );
}

function SplitView(
  props: PaneLayoutProps & { split: PaneSplit },
) {
  const { split, path, onRatioChange, onResizeStart, onResizeEnd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isRow = split.direction === "row";

  const onDividerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      if (total <= 0) return;
      const origin = isRow ? rect.left : rect.top;

      const divider = e.currentTarget;
      const pointerId = e.pointerId;
      divider.setPointerCapture(pointerId);

      let rafId = 0;
      let pendingPos = 0;
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        pendingPos = isRow ? ev.clientX : ev.clientY;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          onRatioChange(path, (pendingPos - origin) / total);
        });
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (rafId) cancelAnimationFrame(rafId);
        divider.releasePointerCapture(pointerId);
        divider.removeEventListener("pointermove", onMove);
        divider.removeEventListener("pointerup", onUp);
        divider.removeEventListener("pointercancel", onUp);
        onResizeEnd();
      };
      onResizeStart(split.direction);
      divider.addEventListener("pointermove", onMove);
      divider.addEventListener("pointerup", onUp);
      divider.addEventListener("pointercancel", onUp);
    },
    [isRow, path, split.direction, onRatioChange, onResizeStart, onResizeEnd],
  );

  const dim = isRow ? "width" : "height";
  const aStyle = { [dim]: `${split.ratio * 100}%` } as React.CSSProperties;
  const bStyle = { [dim]: `${(1 - split.ratio) * 100}%` } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 min-w-0 min-h-0 overflow-hidden ${
        isRow ? "flex-row" : "flex-col"
      }`}
    >
      <div
        className="flex min-w-0 min-h-0 overflow-hidden"
        style={aStyle}
      >
        <PaneLayout {...props} node={split.a} path={[...path, 0]} />
      </div>
      <div
        onPointerDown={onDividerDown}
        style={{ touchAction: "none" }}
        className={`shrink-0 bg-[#1e1e1e] bg-clip-content transition-colors hover:bg-[#22d3ee] ${
          isRow ? "w-[7px] px-[2px] cursor-col-resize" : "h-[7px] py-[2px] cursor-row-resize"
        }`}
      />
      <div
        className="flex min-w-0 min-h-0 overflow-hidden"
        style={bStyle}
      >
        <PaneLayout {...props} node={split.b} path={[...path, 1]} />
      </div>
    </div>
  );
}

function EmptyState({
  projectName,
  onOpenTerminal,
  onOpenBrowser,
  onOpenFiles,
}: {
  projectName: string;
  onOpenTerminal: () => void;
  onOpenBrowser: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <div className="relative flex flex-1 min-h-0 flex-col items-center justify-center overflow-hidden px-8">
      <div className="pointer-events-none absolute inset-0 empty-grid" aria-hidden />
      <div className="relative flex max-w-sm flex-col items-center gap-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#2a2a2a] text-[#919191] animate-icon-glow">
          <svg
            width={26}
            height={26}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-sm font-medium text-[#e5e5e5]">No active terminals</h3>
          <p className="text-xs leading-relaxed text-[#919191]">
            Open a terminal to start working on{" "}
            <span className="font-mono">{projectName}</span>, or open a browser
            on a running service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenTerminal}
            className={`flex items-center gap-2 rounded-lg bg-[#e5e5e5] px-4 py-2 text-xs font-medium text-[#1a1a1a] hover:opacity-85 animate-cta-breath ${PRESS} ${FOCUS_RING}`}
          >
            <Terminal className="h-4 w-4" strokeWidth={1.75} />
            New Terminal
            <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
          </button>
          <button
            type="button"
            onClick={onOpenBrowser}
            className={`flex items-center gap-2 rounded-lg border border-[#2e2e2e] px-4 py-2 text-xs font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
          >
            <Globe className="h-4 w-4" strokeWidth={1.75} />
            Open browser
          </button>
        </div>
        {/* Tertiary, the way the app keeps "Resume a past session" under its
            two buttons. */}
        <button
          type="button"
          onClick={onOpenFiles}
          className={`-mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[#919191] transition-colors hover:text-[#b3b3b3] ${FOCUS_RING}`}
        >
          <Folder className="h-3 w-3" strokeWidth={1.75} />
          Browse the project files
          <kbd className="ml-1 text-[10px] opacity-70">⌘⇧E</kbd>
        </button>
      </div>
    </div>
  );
}

function FooterActionButton({
  action,
  onRun,
}: {
  action: DemoAction;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      title={action.label}
      style={actionButtonStyle(action.color)}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[rgba(204,204,204,0.18)] bg-[var(--action-tint,#262626)] px-2.5 py-1 text-[11px] font-medium text-[#b3b3b3] hover:bg-[var(--action-tint-strong,rgba(255,255,255,0.1))] hover:text-[#cccccc] ${PRESS} ${FOCUS_RING}`}
    >
      {action.emoji && (
        <span className="text-[11px] leading-none">{action.emoji}</span>
      )}
      <span>{action.label}</span>
    </button>
  );
}
