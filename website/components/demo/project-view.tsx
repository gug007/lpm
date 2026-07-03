"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  Globe,
  Plus,
  Terminal,
} from "lucide-react";
import type {
  DemoAction,
  DemoBranch,
  DemoGit,
  DemoProject,
  DemoService,
} from "./projects";
import { PaneHeader, StreamingOutput, type TabInfo } from "./terminal-pane";
import { DemoActionModal } from "./action-modal";
import { DemoAddActionModal, type NewActionInput } from "./add-action-modal";
import { AgentTerminal, type AgentStatus } from "./agent-terminal";
import { BrowserView } from "./browser-view";
import { DemoBranchSwitcher } from "./branch-switcher";
import { TabContextMenu, TabRenameModal } from "./tab-controls";
import { AppTip } from "./app-tip";
import { OpenInDropdown } from "./open-in-dropdown";
import { ReviewView } from "./review-view";
import {
  type LeafContent,
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
  type SplitDirection,
  addTabToLeaf,
  appendLeaf,
  collectLeaves,
  closeServiceTab,
  closeTabInLeaf,
  collectServiceNames,
  defaultLabel,
  findLeaf,
  makeLeaf,
  newBrowserContent,
  newReviewContent,
  newShellContent,
  setActiveTab,
  setRatioAtPath,
  splitAtLeaf,
  tabKey,
  updateTabInLeaf,
} from "./pane-tree";

const MAX_TERMINAL_HISTORY = 200;

type ActionTerminalMap = Record<string, DemoAction>;

type ProjectViewProps = {
  project: DemoProject;
  runningServices: Set<string>;
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
  onAgentStatus?: (status: AgentStatus) => void;
  startButtonRef?: React.Ref<HTMLButtonElement>;
  startRingPulse?: boolean;
};

function reconcileServices(
  tree: PaneNode | null,
  running: Set<string>,
): PaneNode | null {
  let t: PaneNode | null = tree;
  for (const name of collectServiceNames(t)) {
    if (!running.has(name) && t) t = closeServiceTab(t, name);
  }
  const existing = new Set(collectServiceNames(t));
  for (const name of running) {
    if (existing.has(name)) continue;
    const leaf = makeLeaf({ kind: "service", name });
    t = t
      ? { kind: "split", direction: "row", ratio: 0.5, a: leaf, b: t }
      : leaf;
  }
  return t;
}

export function DemoProjectView({
  project,
  runningServices,
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
  onAgentStatus,
  startButtonRef,
  startRingPulse,
}: ProjectViewProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const autoAction = project.autoStart
    ? project.actions.find((a) => a.name === project.autoStart)
    : undefined;
  const autoKey = autoAction ? `${autoAction.name}-auto` : null;
  const [tree, setTree] = useState<PaneNode | null>(() =>
    autoAction && autoKey
      ? makeLeaf({
          kind: "action",
          key: autoKey,
          label: autoAction.label,
          ...(autoAction.emoji ? { emoji: autoAction.emoji } : {}),
        })
      : null,
  );
  const [actionTerminals, setActionTerminals] = useState<ActionTerminalMap>(() =>
    autoAction && autoKey ? { [autoKey]: autoAction } : {},
  );
  const [agentTabStatus, setAgentTabStatus] = useState<
    Record<string, AgentStatus>
  >({});

  const handleAgentStatus = (tabKey: string, status: AgentStatus) => {
    setAgentTabStatus((prev) => ({ ...prev, [tabKey]: status }));
    onAgentStatus?.(status);
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

  const addBrowserToLeaf = (leafId: string) => {
    setTree((prev) => (prev ? addTabToLeaf(prev, leafId, newBrowserContent()) : prev));
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
            t.kind === "service"
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
            t.kind === "service" ? t : { ...t, pinned: !t.pinned },
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
    setTree((prev) =>
      prev
        ? splitAtLeaf(prev, paneId, direction, makeLeaf(newShellContent(prev)))
        : prev,
    );
  };

  const handleCloseTab = (leafId: string, tabIdx: number) => {
    setTree((prev) => {
      if (!prev) return prev;
      const leaf = findLeaf(prev, leafId);
      const tab = leaf?.tabs[tabIdx];
      if (!tab) return prev;
      if (tab.kind === "service") onToggleService(tab.name);
      else if (tab.kind === "action") {
        const key = tab.key;
        setActionTerminals((map) => {
          if (!(key in map)) return map;
          const next = { ...map };
          delete next[key];
          return next;
        });
      }
      return closeTabInLeaf(prev, leafId, tabIdx);
    });
  };

  const handleSelectTab = (leafId: string, tabIdx: number) => {
    setTree((prev) => (prev ? setActiveTab(prev, leafId, tabIdx) : prev));
  };

  const handleRatioChange = useCallback(
    (path: number[], ratio: number) => {
      setTree((prev) => (prev ? setRatioAtPath(prev, path, ratio) : prev));
    },
    [],
  );

  const handleResizeStart = useCallback((dir: SplitDirection) => {
    setResizeDir(dir);
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const applyServicesToTree = (names: string[]) => {
    setTree((prev) => reconcileServices(prev, new Set(names)));
  };

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

  const handleToggleService = (name: string) => {
    onToggleService(name);
    const next = new Set(runningServices);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    applyServicesToTree([...next]);
  };

  const handleStartProfile = (profile: string) => {
    const p = project.profiles.find((x) => x.name === profile);
    if (!p) return;
    onStartServices(p.services);
    applyServicesToTree(p.services);
    setStartOpen(false);
  };

  return (
    <div className="relative flex flex-1 min-w-0 min-h-0 flex-col bg-[#1a1a1a]">
      <Header
        project={project}
        anyRunning={anyRunning}
        headerActions={headerActions}
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((v) => !v)}
        onCloseStart={() => setStartOpen(false)}
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
          />
        </div>
      ) : (
        <EmptyState
          projectName={project.name}
          onOpenTerminal={openNewPaneWithShell}
          onOpenBrowser={openNewPaneWithBrowser}
        />
      )}

      {tree && (
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
      )}

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
        if (!tab || tab.kind === "service") return null;
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
        if (!tab || tab.kind === "service") return null;
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
  onNewBrowser: (leafId: string) => void;
  onNewReview: (leafId: string) => void;
  onTabContextMenu: (leafId: string, tabIdx: number, x: number, y: number) => void;
  onRatioChange: (path: number[], ratio: number) => void;
  onResizeStart: (dir: SplitDirection) => void;
  onResizeEnd: () => void;
  agentTabStatus: Record<string, AgentStatus>;
  onAgentTabStatus: (tabKey: string, status: AgentStatus) => void;
};

function PaneLayout(props: PaneLayoutProps) {
  if (props.node.kind === "leaf") return <Leaf {...props} leaf={props.node} />;
  return <SplitView {...props} split={props.node} />;
}

type LeafContext = {
  project: DemoProject;
  runningServices: Set<string>;
  actionTerminals: ActionTerminalMap;
  agentTabStatus: Record<string, AgentStatus>;
  onAgentTabStatus: (tabKey: string, status: AgentStatus) => void;
};

type ResolvedTab = {
  info: TabInfo;
  body: ReactNode;
};

function resolveTab(tab: LeafContent, ctx: LeafContext): ResolvedTab {
  const key = tabKey(tab);
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
    status: action?.agent ? ctx.agentTabStatus[key] : undefined,
  };
  if (!action) return { info, body: null };
  return {
    info,
    body: action.agent ? (
      <AgentTerminal
        key={tab.key}
        agent={action.agent}
        cwd={ctx.project.root}
        autoPrompt={action.autoPrompt}
        autoMode={action.autoMode}
        onStatus={(status) => ctx.onAgentTabStatus(key, status)}
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
    <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
      <PaneHeader
        tabs={resolved.map((r) => r.info)}
        activeIdx={leaf.activeTabIdx}
        onSelectTab={(i) => onSelectTab(leaf.id, i)}
        onCloseTab={(i) => onCloseTab(leaf.id, i)}
        onNewTab={() => onNewTab(leaf.id)}
        onNewBrowser={() => onNewBrowser(leaf.id)}
        onNewReview={() => onNewReview(leaf.id)}
        onTabContextMenu={(i, x, y) => onTabContextMenu(leaf.id, i, x, y)}
        onSplitRight={() => onSplit(leaf.id, "row")}
        onSplitDown={() => onSplit(leaf.id, "col")}
      />
      <div className="relative flex-1 min-h-0">
        {resolved.map(({ info, body }, i) => (
          <div
            key={info.key}
            className={`absolute inset-0 flex-col ${
              i === leaf.activeTabIdx ? "flex" : "hidden"
            }`}
          >
            {body}
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitView(
  props: PaneLayoutProps & { split: PaneSplit },
) {
  const { split, path, onRatioChange, onResizeStart, onResizeEnd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isRow = split.direction === "row";

  const onDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      if (total <= 0) return;
      const origin = isRow ? rect.left : rect.top;

      let rafId = 0;
      let pendingPos = 0;
      const onMove = (ev: MouseEvent) => {
        pendingPos = isRow ? ev.clientX : ev.clientY;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          onRatioChange(path, (pendingPos - origin) / total);
        });
      };
      const onUp = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        onResizeEnd();
      };
      onResizeStart(split.direction);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
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
        onMouseDown={onDividerDown}
        className={`shrink-0 bg-[#2d2d2d] hover:bg-[#4a4a4a] transition-colors ${
          isRow ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize"
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
    <div className="relative flex flex-1 min-h-0 flex-col items-center justify-center px-8">
      <div className="pointer-events-none absolute inset-0 empty-grid" aria-hidden />
      <div className="relative flex max-w-md flex-col items-center gap-6 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#242424] text-[#b3b3b3] animate-icon-glow">
          <Terminal className="h-6 w-6" strokeWidth={1.5} />
          <span
            aria-hidden
            className="absolute bottom-3.5 right-3.5 h-2 w-[3px] bg-[#e5e5e5] animate-caret-blink"
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="text-base font-semibold tracking-tight text-[#e5e5e5]">
            Ready when you are,{" "}
            <span className="font-mono text-[#e5e5e5]">{projectName}</span>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-[#919191]">
            Hit{" "}
            <span className="rounded-md border border-[#2e2e2e] bg-[#242424] px-1.5 py-px font-mono text-[10px] text-[#b3b3b3]">
              Start
            </span>{" "}
            to spin up services, or open a terminal to poke around.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTerminal}
            className="flex items-center gap-2 rounded-lg border border-[#2e2e2e] bg-[#242424] px-4 py-2 text-xs font-medium text-[#e5e5e5] transition-colors hover:bg-[#2a2a2a] animate-cta-breath focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            <Terminal className="h-4 w-4" strokeWidth={1.75} />
            <span>New terminal</span>
          </button>
          <button
            type="button"
            onClick={onOpenBrowser}
            className="flex items-center gap-2 rounded-lg border border-[#2e2e2e] bg-[#1d1d1d] px-4 py-2 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#242424] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            <Globe className="h-4 w-4" strokeWidth={1.75} />
            <span>Open browser</span>
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
    if (trimmed === "date") return "Thu Apr 23 09:01:42 UTC 2026";
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
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-[#1a1a1a]"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="text-gray-400">
        lpm demo · try{" "}
        <span className="text-emerald-400">ls</span>,{" "}
        <span className="text-emerald-400">git status</span>,{" "}
        <span className="text-emerald-400">help</span>
      </div>
      {history.map((h, i) => (
        <div key={i}>
          <div className="text-gray-100 whitespace-pre-wrap break-all">
            <span className="text-cyan-300">{h.prompt}</span>
            {h.input}
          </div>
          {h.output && (
            <div className="text-gray-300 whitespace-pre-wrap">{h.output}</div>
          )}
        </div>
      ))}
      <form onSubmit={onSubmit} className="flex items-center text-gray-100">
        <span className="text-cyan-300 whitespace-pre">{prompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className="flex-1 bg-transparent outline-none text-gray-100 font-mono caret-gray-100"
        />
      </form>
    </div>
  );
}

function DropdownSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#919191]">
      {children}
    </div>
  );
}

function HeaderActionButton({
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
      className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2.5 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
    >
      {action.emoji && (
        <span className="text-[13px] leading-none">{action.emoji}</span>
      )}
      <span className={action.emoji ? "hidden lg:inline" : ""}>
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
      className="flex shrink-0 items-center gap-1 rounded-md border border-[#2e2e2e] bg-[#242424] px-2 py-1 text-[10px] font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
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
  startRingPulse,
}: HeaderProps) {
  const hasServices = project.services.length > 0;
  const startColor = anyRunning
    ? "bg-[#f87171] text-white"
    : "bg-[#e5e5e5] text-[#1a1a1a]";
  const startChevronBorder = anyRunning
    ? "border-white/20 bg-[#f87171] text-white"
    : "border-[#1a1a1a]/20 bg-[#e5e5e5] text-[#1a1a1a]";
  const chevronIdle =
    "border-[#2e2e2e] bg-[#242424] text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]";
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-12 shrink-0">
      <h1 className="min-w-0 shrink-0 truncate pr-2 text-xl font-semibold tracking-tight text-[#e5e5e5]">
        {project.label ?? project.name}
      </h1>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {headerActions.map((a) => (
            <HeaderActionButton
              key={a.name}
              action={a}
              onRun={() => onOpenAction(a)}
            />
          ))}
          <button
            type="button"
            onClick={onAddAction}
            title="Create action"
            aria-label="Create action"
            className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-lg border border-dashed border-[#3a3a3a] px-2 text-xs font-medium text-[#919191] transition-colors hover:border-[#555] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Action</span>
          </button>
        </div>

        <OpenInDropdown />

        <div className="relative flex shrink-0">
          {hasServices && (
            <button
              ref={startButtonRef}
              type="button"
              onClick={onStartStop}
              aria-label={anyRunning ? "Stop services" : "Start services"}
              className={`rounded-l-lg px-3.5 py-1.5 text-xs font-medium transition-all hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a] ${startColor} ${
                startRingPulse && !anyRunning ? "start-ring-pulse" : ""
              }`}
            >
              {anyRunning ? "Stop" : "Start"}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleStart}
            aria-label="Services and profiles"
            aria-expanded={startOpen}
            aria-haspopup="menu"
            className={`${hasServices ? "rounded-r-lg border-l" : "rounded-lg border"} px-1.5 py-1.5 transition-all hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a] ${hasServices ? startChevronBorder : chevronIdle}`}
          >
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          {startOpen && (
            <div
              className="absolute right-0 top-full z-40 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424] shadow-xl"
              onMouseLeave={onCloseStart}
            >
              {project.profiles.length > 0 && (
                <>
                  <DropdownSectionLabel>Profiles</DropdownSectionLabel>
                  {project.profiles.map((p) => {
                    const isActive =
                      runningServices.size > 0 &&
                      p.services.length === runningServices.size &&
                      p.services.every((s) => runningServices.has(s));
                    return (
                      <button
                        key={p.name}
                        type="button"
                        role="menuitem"
                        onClick={() => onStartProfile(p.name)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:bg-[#2a2a2a]"
                      >
                        <span className="mt-[5px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12px]">{p.name}</span>
                          <span className="truncate text-[10px] text-[#919191] font-mono">
                            {p.services.join(" · ")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="mx-3 border-t border-[#2e2e2e]" />
                </>
              )}
              <DropdownSectionLabel>Services</DropdownSectionLabel>
              <div className="pb-1.5">
                {project.services.length > 0 ? (
                  project.services.map((s) => (
                    <ServiceMenuItem
                      key={s.name}
                      service={s}
                      running={runningServices.has(s.name)}
                      onClick={() => onToggleService(s.name)}
                    />
                  ))
                ) : (
                  <div className="px-3 py-1.5 text-[11px] italic text-[#919191]">
                    No services yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceMenuItem({
  service,
  running,
  onClick,
}: {
  service: DemoService;
  running: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={running}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#2a2a2a] focus-visible:outline-none focus-visible:bg-[#2a2a2a] ${
        running ? "text-[#e5e5e5] font-medium" : "text-[#b3b3b3]"
      }`}
    >
      <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      </span>
      <span className="flex-1 truncate font-mono">{service.name}</span>
      {service.port !== undefined && (
        <span className="text-[10px] text-[#919191] tabular-nums">
          :{service.port}
        </span>
      )}
    </button>
  );
}
