"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NO_AUTOFILL } from "./no-autofill";
import { useStickToBottom } from "./use-stick-to-bottom";
import { Globe, Terminal } from "lucide-react";
import type {
  DemoAction,
  DemoBranch,
  DemoGit,
  DemoProject,
} from "./projects";
import {
  PaneHeader,
  ServiceLabelBar,
  StreamingOutput,
  type TabInfo,
} from "./terminal-pane";
import { DemoActionModal } from "./action-modal";
import { DemoAddActionModal, type NewActionInput } from "./add-action-modal";
import {
  AgentTerminal,
  type AgentStatus,
  type AgentTurnTiming,
} from "./agent-terminal";
import { BrowserView } from "./browser-view";
import { DemoBranchSwitcher } from "./branch-switcher";
import { TabContextMenu, TabRenameModal } from "./tab-controls";
import { AppTip } from "./app-tip";
import { OpenInDropdown } from "./open-in-dropdown";
import { ReviewView } from "./review-view";
import { actionButtonStyle } from "./action-colors";
import { CreateActionButton } from "./create-action-button";
import { StartControl } from "./start-control";
import { FOCUS_RING, PRESS } from "./ui";
import {
  type LeafContent,
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
  type SplitDirection,
  addTabToLeaf,
  appendLeaf,
  collectLeaves,
  closeTabInLeaf,
  defaultLabel,
  findLeaf,
  isServiceTab,
  makeLeaf,
  newBrowserContent,
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

const MAX_TERMINAL_HISTORY = 200;

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

  const leafCtx: LeafContext = {
    project,
    runningServices,
    actionTerminals,
    agentTabStatus,
    onAgentTabStatus: handleAgentStatus,
  };

  return (
    <div className="relative flex flex-1 min-w-0 min-h-0 flex-col bg-[#1a1a1a]">
      <Header
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
            onNewReview={addReviewToLeaf}
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
        />
      )}

      {/* Outside the tree guard: the footer must not pop in and shove the
          workspace up the moment the first pane appears. */}
      <div className="flex shrink-0 items-center gap-1 bg-[#1a1a1a] px-2 py-1">
        <AppTip />
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
  onNewReview: (leafId: string) => void;
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
      body: <InteractiveTerminal key={tab.id} projectRoot={ctx.project.root} />,
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
      body: <ReviewView key={tab.id} project={ctx.project} />,
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
  onNewReview,
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
  return (
    <div
      onMouseDownCapture={() => onFocusPane(leaf.id)}
      className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-x border-t border-[#2e2e2e]"
    >
      <PaneHeader
        focused={focusedLeafId === leaf.id}
        tabs={resolved.map((r) => r.info)}
        activeIdx={leaf.activeTabIdx}
        onSelectTab={(i) => onSelectTab(leaf.id, i)}
        onCloseTab={(i) => onCloseTab(leaf.id, i)}
        onNewTab={() => onNewTab(leaf.id)}
        onNewBrowser={() => onNewBrowser(leaf.id)}
        onNewReview={() => onNewReview(leaf.id)}
        onOpenPort={(port) =>
          onNewBrowser(leaf.id, `http://localhost:${port}`)
        }
        onTabContextMenu={(i, x, y) => onTabContextMenu(leaf.id, i, x, y)}
        onSplitRight={() => onSplit(leaf.id, "row")}
        onSplitDown={() => onSplit(leaf.id, "col")}
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
}: {
  projectName: string;
  onOpenTerminal: () => void;
  onOpenBrowser: () => void;
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
      </div>
    </div>
  );
}

export function InteractiveTerminal({ projectRoot }: { projectRoot: string }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    { prompt: string; input: string; output: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([
    history,
  ]);

  // A shell you just opened should take what you type. Only when the click that
  // opened it came from inside the demo, so a pane mounted for a project the
  // visitor is not looking at never steals the page's focus — and never with a
  // scroll, which would shove the page under them.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest(".replica-ui")) return;
    input.focus({ preventScroll: true });
  }, []);

  const rel = projectRoot.replace(/^~\/?/, "");
  const prompt = rel ? `~/${rel} $ ` : `~ $ `;

  const fakeRun = (cmd: string): string => {
    const trimmed = cmd.trim();
    if (!trimmed) return "";
    if (trimmed === "ls") {
      return "README.md  package.json  src/  scripts/  tests/";
    }
    if (trimmed === "pwd") return projectRoot;
    if (trimmed === "git status") {
      return [
        "On branch main",
        "Your branch is up to date with 'origin/main'.",
        "",
        "nothing to commit, working tree clean",
      ].join("\n");
    }
    if (trimmed === "git log --oneline -3") {
      return [
        "aa990a3 refactor build: remove goreleaser config",
        "5068101 chore(release): notarized macOS binaries",
        "1caaf7f feat(vite): bump target to ES2022",
      ].join("\n");
    }
    if (trimmed === "whoami") return "demo";
    if (trimmed === "date") return new Date().toString();
    if (trimmed === "clear") return "__clear__";
    if (trimmed.startsWith("echo ")) return trimmed.slice(5);
    if (trimmed === "help") {
      return [
        "demo shell · try:",
        "  ls          list files",
        "  git status  working tree status",
        "  whoami      current user",
        "  echo X      print X",
        "  clear       clear terminal",
      ].join("\n");
    }
    return `zsh: command not found: ${trimmed.split(" ")[0]}`;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out = fakeRun(input);
    if (out === "__clear__") {
      setHistory([]);
    } else {
      setHistory((h) => {
        const next = [...h, { prompt, input, output: out }];
        return next.length > MAX_TERMINAL_HISTORY
          ? next.slice(-MAX_TERMINAL_HISTORY)
          : next;
      });
    }
    setInput("");
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-[#1a1a1a]"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="text-[#919191]">
        lpm demo · try{" "}
        <span className="text-[#4ade80]">ls</span>,{" "}
        <span className="text-[#4ade80]">git status</span>,{" "}
        <span className="text-[#4ade80]">help</span>
      </div>
      {history.map((h, i) => (
        <div key={i}>
          <div className="text-[#cccccc] whitespace-pre-wrap break-all">
            <span className="text-[#22d3ee]">{h.prompt}</span>
            {h.input}
          </div>
          {h.output && (
            <div className="text-[#b3b3b3] whitespace-pre-wrap">{h.output}</div>
          )}
        </div>
      ))}
      <form onSubmit={onSubmit} autoComplete="off" className="flex items-center text-[#cccccc]">
        <span className="text-[#22d3ee] whitespace-pre">{prompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          {...NO_AUTOFILL}
          className="flex-1 bg-transparent outline-none text-[#cccccc] font-mono caret-[#cccccc]"
        />
      </form>
    </div>
  );
}

function HeaderActionButton({
  action,
  onRun,
  buttonRef,
}: {
  action: DemoAction;
  onRun: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onRun}
      title={action.label}
      style={actionButtonStyle(action.color)}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#2e2e2e] bg-[var(--action-tint,#242424)] px-3.5 text-xs font-medium text-[#b3b3b3] hover:bg-[var(--action-tint-strong,rgba(255,255,255,0.1))] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
    >
      {action.emoji && (
        <span className="text-[13px] leading-none">{action.emoji}</span>
      )}
      {/* Agents are the headline feature — only utility actions collapse to
          their emoji on narrow windows. */}
      <span
        className={
          action.emoji && !action.agent ? "hidden @min-[860px]:inline" : ""
        }
      >
        {action.label}
      </span>
    </button>
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

type HeaderProps = {
  project: DemoProject;
  anyRunning: boolean;
  headerActions: DemoAction[];
  startOpen: boolean;
  runningServices: Set<string>;
  onToggleStart: () => void;
  onCloseStart: () => void;
  onStartStop: () => void;
  onStartProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onOpenAction: (a: DemoAction) => void;
  onAddAction: () => void;
  startButtonRef?: React.Ref<HTMLButtonElement>;
  agentButtonRef?: React.RefObject<HTMLButtonElement | null>;
  codexButtonRef?: React.RefObject<HTMLButtonElement | null>;
  startRingPulse?: boolean;
};

function Header({
  project,
  anyRunning,
  headerActions,
  startOpen,
  runningServices,
  onToggleStart,
  onCloseStart,
  onStartStop,
  onStartProfile,
  onToggleService,
  onOpenAction,
  onAddAction,
  startButtonRef,
  agentButtonRef,
  codexButtonRef,
  startRingPulse,
}: HeaderProps) {
  const agentAction = headerActions.find((a) => a.agent === "claude");
  const codexAction = headerActions.find((a) => a.agent === "codex");
  // @container: action labels follow the pane's own width, which is far
  // narrower than the viewport when the demo is embedded in a page.
  return (
    <div className="@container flex shrink-0 items-center gap-4 px-3 py-1">
      <div className="min-w-0 shrink-0 truncate pr-2 text-xl font-semibold tracking-tight text-[#e5e5e5]">
        {project.label ?? project.name}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto">
          {headerActions.map((a) => (
            <HeaderActionButton
              key={a.name}
              action={a}
              buttonRef={
                a === agentAction
                  ? agentButtonRef
                  : a === codexAction
                    ? codexButtonRef
                    : undefined
              }
              onRun={() => onOpenAction(a)}
            />
          ))}
        </div>
        <CreateActionButton onClick={onAddAction} />
        <OpenInDropdown />
        <StartControl
          project={project}
          running={anyRunning}
          runningServices={runningServices}
          open={startOpen}
          onToggleMenu={onToggleStart}
          onCloseMenu={onCloseStart}
          onStartStop={onStartStop}
          onStartProfile={onStartProfile}
          onToggleService={onToggleService}
          startButtonRef={startButtonRef}
          ringPulse={startRingPulse}
        />
      </div>
    </div>
  );
}

