import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { type InteractivePaneHandle } from "./InteractivePane";
import { InteractiveTab } from "./InteractiveTab";
import { BrowserPane } from "./BrowserPane";
import { BrowserMirrorPlaceholder } from "./BrowserMirrorPlaceholder";
import { IS_MIRROR_WINDOW } from "../mirror";
import { MemoryView } from "./MemoryView";
import { ToolkitView } from "./toolkit/ToolkitView";
import { FilesPane } from "./files/FilesPane";
import { ScheduledView } from "./ScheduledView";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ScrollFadeEdges } from "./ui/ScrollFadeEdges";
import { Pane, type PaneHandle } from "./Pane";
import { HeaderTab } from "./terminal/HeaderTab";
import { RenameModal } from "./RenameModal";
import { EmojiMark } from "./EmojiMark";
import { TabContextMenu } from "./terminal/TabContextMenu";
import { ServiceTabContextMenu } from "./terminal/ServiceTabContextMenu";
import { ServiceExitBar } from "./terminal/ServiceExitBar";
import { ServicePortLinks } from "./terminal/ServicePortLinks";
import { ServiceCommand } from "./terminal/ServiceCommand";
import { TerminalEndedBar } from "./terminal/TerminalEndedBar";
import { useEndedTerminals } from "../store/endedTerminals";
import { serviceCrashed } from "../serviceExit";
import { IconBtn } from "./terminal/IconBtn";
import {
  SplitRightIcon,
  SplitDownIcon,
  ExpandIcon,
  ShrinkIcon,
} from "./terminal/icons";
import { AddTerminalButton } from "./terminal/AddTerminalButton";
import type { RemoteAgentLaunch } from "../remoteAgentTabs";
import type { LaunchpadProject } from "../hooks/useLaunchpad";
import type { RunActionOpts } from "../hooks/useProjectActions";
import type { ActionInfo } from "../types";
import { PaneMenuButton } from "./terminal/PaneMenuButton";
import { PaneToolbar } from "./terminal/PaneToolbar";
import { usePaneToolbar } from "../hooks/usePaneToolbar";
import type { PaneActionId } from "../paneActions";
import type { UtilityTabKind } from "./terminal/utilityTabToggle";
import { TerminalSearchBar } from "./terminal/TerminalSearchBar";
import type { FindDirection, FindOptions, FindOutcome, FindResults } from "./terminal/terminalFind";
import { XIcon, GlobeIcon, TerminalIcon, ZapIcon, BrainIcon, LayersIcon, FolderIcon, SourceControlIcon, ClockIcon } from "./icons";
import { Columns2 } from "lucide-react";
import { Tooltip } from "./ui/Tooltip";
import { SortableTab, TabStrip } from "./TerminalTabDnd";
import { TerminalComposer } from "./TerminalComposer";
import type { DuplicatePromptSeed } from "./BulkDuplicateDialog";
import { ComposerReopenBar } from "./ComposerReopenBar";
import { useScrollFade } from "../hooks/useScrollFade";
import { useWheelScrollX } from "../hooks/useWheelScrollX";
import { computeScrollIntoViewLeft } from "../hooks/scrollIntoViewX";
import { useTabScroll } from "../store/tabScroll";
import {
  ALL_SERVICES,
  followsAgentTitle,
  isTerminalTab,
  terminalDisplayLabel,
  filesTabLabel,
  terminalOriginLabel,
  type PaneLeaf,
  type SplitDirection,
  type TerminalInstance,
} from "../paneTree";
import { agentSessionOf } from "../agentSession";
import { peerSlugOf } from "../peer/markers";
import { TerminalCopyAnswerOverlay } from "./TerminalCopyAnswerOverlay";
import { useClearStatusOnInteraction } from "../hooks/useClearStatusOnInteraction";
import { paneAgentStatus, type PaneStatus } from "../hooks/usePaneStatus";
import { closePaneTooltip, runningAgentCount } from "../paneCloseSummary";
import { useBrowserUrls } from "../store/browserUrls";
import { useFilesView } from "../store/filesView";
import { canForkSession } from "../forkSession";
import { actionTextColor } from "../actionColors";
import { SendLaterTabMark } from "./SendLaterTabMark";
import { SharedTabMark } from "./share/SharedTabMark";
import { PaneShareButton } from "./share/PaneShareButton";
import { useTabShares } from "../store/tabShares";
import { chordLabel } from "../keys";
import { isMac } from "../platform";
import { useIsFullscreen } from "../hooks/useIsFullscreen";
import { paneHeaderPadding } from "./terminal/paneHeaderPadding";
import { composerAgentName } from "../composerText";
import { TabOverflowChip } from "./terminal/TabOverflowChip";
import {
  ALL_STRIP_KEY,
  STRIP_EDGE_ZONE,
  serviceStripKey,
  terminalStripKey,
  usePaneStripOverflow,
} from "./terminal/usePaneStripOverflow";
import { ServiceColumnActions } from "./terminal/ServiceColumnActions";
import { ServiceStateDot } from "./terminal/ServiceStateDot";
import { useShallow } from "zustand/react/shallow";
import { pickCommands, useTerminalCommands } from "../store/terminalCommands";
import { tabCommandDetails, tabCommandMark, terminalStripLabel } from "../tabCommand";
import { CommandMarkIcon } from "./terminal/CommandMarkIcon";

export type StatusKind = "Done" | "Waiting" | "Error";

function faviconFor(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

// The in-pane browser has no IPC to report its real favicon, so guess it from
// the origin and fall back to a globe when that 404s or doesn't decode (some
// servers answer /favicon.ico with an HTML page → naturalWidth 0).
function BrowserTabIcon({ id }: { id: string }) {
  const url = useBrowserUrls((s) => s.urls[id]);
  const src = faviconFor(url);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (!src || src === brokenSrc) return <GlobeIcon />;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setBrokenSrc(src)}
      onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) setBrokenSrc(src); }}
      className="h-3.5 w-3.5 rounded-sm"
    />
  );
}

function FilesTabIcon({ id }: { id: string }) {
  const changesOnly = useFilesView((s) => s.views[id] === "changes");
  return changesOnly ? <SourceControlIcon /> : <FolderIcon />;
}

function TabIcon({ tab }: { tab: TerminalInstance }) {
  if (tab.kind === "browser") return <BrowserTabIcon id={tab.id} />;
  if (tab.kind === "memory") return <BrainIcon />;
  if (tab.kind === "toolkit") return <LayersIcon />;
  if (tab.kind === "files") return <FilesTabIcon id={tab.id} />;
  if (tab.kind === "automations") return <ClockIcon size={14} />;
  if (tab.emoji)
    return (
      <span
        className="flex h-3.5 w-3.5 items-center justify-center text-[12px] leading-none"
        style={{ color: actionTextColor(tab.color) }}
      >
        <EmojiMark emoji={tab.emoji} />
      </span>
    );
  return <TerminalIcon />;
}

/** A running service that the primary pane renders as an additional tab. */
export interface ServiceTabInfo {
  name: string;
  output: string;
  sessionKey: string;
  cwd: string;
  // Live TCP-listen ports the service's process tree owns, shown on its tab.
  // Empty until the service binds (or always, for remote projects).
  ports?: number[];
  // The port the config names, when the service listens elsewhere instead.
  configuredPort?: number;
  // The service's command has ended; its tab stays with the last output.
  exited?: boolean;
  exitCode?: number | null;
  // The command the service runs, shown on its pane's bar.
  cmd?: string;
}

export interface PaneViewProps {
  pane: PaneLeaf;
  projectName: string;
  projectLabel: string;
  visible: boolean;
  focused: boolean;
  fullscreen: boolean;
  searchActive: boolean;
  searchFocusRequest: number;
  canClose: boolean;
  fontSize: number;
  composerOpen: boolean;
  themeOverride: ITheme | null;
  paneStatus?: PaneStatus;
  services?: ServiceTabInfo[];
  // Every terminal tab in the whole project ({id,label}), forwarded to the
  // composer's "@" mention so it can reference any terminal's logs.
  allTerminals: { id: string; label: string }[];
  // Absolute working directory used to resolve relative paths printed in
  // interactive shells (typically the project root).
  interactiveCwd: string;
  onFocusPane: (paneId: string) => void;
  onFocusTab: (paneId: string, tabIdx: number) => void;
  onFocusService: (paneId: string, serviceName: string) => void;
  onStopService: (serviceName: string) => void;
  onRestartService: (serviceName: string) => void;
  // Absent where services can't be edited from here.
  onEditService?: (serviceName: string) => void;
  onAddTerminal: (paneId: string) => void;
  // The project the + popup starts things in.
  newTabProject: LaunchpadProject;
  // An agent picked from the + popup, opened in this pane.
  onLaunchAgent: (paneId: string, launch: RemoteAgentLaunch) => void;
  // A command typed into the + popup, run in a new terminal in this pane.
  onRunCommand: (paneId: string, command: string) => void;
  // A project action started from the + popup, in this pane.
  onRunAction: (paneId: string, action: ActionInfo, opts?: RunActionOpts) => void;
  // The pane ⌘T asked to show its + popup, until it has.
  newTabPaneId: string | null;
  onNewTabHandled: () => void;
  onAddBrowser: (paneId: string) => void;
  onReviewChanges: (paneId: string) => void;
  onAddToolkit: (paneId: string) => void;
  onAddFiles: (paneId: string) => void;
  // Absent outside a local project, which takes the action off the header.
  onAddAutomations?: (paneId: string) => void;
  onResumeSession?: () => void;
  onCloseTerminal: (paneId: string, tabIdx: number) => void;
  onCloseOtherTerminals: (paneId: string, tabIdx: number) => void;
  onRestartTerminal: (terminalId: string) => void;
  onForkTerminal: (paneId: string, termId: string) => void;
  // Fork the tab's agent session into a fresh duplicate of the project.
  // Disabled (false) for peer-hosted and SSH-remote projects, whose sessions
  // this Mac can't duplicate.
  canForkIntoCopy: boolean;
  onForkTerminalIntoCopy: (paneId: string, termId: string, label: string) => void;
  onRenameTerminal: (
    paneId: string,
    tabIdx: number,
    label: string,
    emoji?: string,
  ) => void;
  onRestoreSessionTitle: (paneId: string, tabIdx: number) => void;
  onTogglePinTab: (paneId: string, tabIdx: number) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onToggleUtility: (paneId: string, kind: UtilityTabKind) => void;
  onToggleFullscreen: (paneId: string) => void;
  onRegisterTerminalHandle: (
    terminalId: string,
    handle: InteractivePaneHandle | null,
  ) => void;
  onRegisterServiceHandle: (
    serviceName: string,
    handle: PaneHandle | null,
  ) => void;
  onClearStatus: (terminalId: string, kind: StatusKind) => void;
  onSubmitInput: (terminalId: string, input: string | string[]) => boolean;
  onFocusTerminalInput: (terminalId: string) => void;
  // Open the seeded Duplicate dialog from a composer's split button, carrying
  // the current prompt. On confirm the current project runs it as copy #1
  // (`runHere`) alongside the seed's fresh copies, all in parallel.
  onRunInDuplicates: (seed: DuplicatePromptSeed, runHere: () => Promise<void>) => void;
  // Composer memory list → Memory tab: open the tab (or focus the existing one)
  // on the session the user asked to read.
  onOpenMemorySession: (sessionId: string) => void;
  onDetachMemory: (terminalId: string) => void;
  memoryTarget: { name: string; seq: number } | null;
  // Whether the project's agent transcripts can be read: on this Mac, or on the
  // paired machine the project is on. False for SSH-remote projects — hides the
  // terminal's copy-last-answer overlay.
  agentSessionsReadable: boolean;
  onFindInPane: (
    paneId: string,
    query: string,
    direction: FindDirection,
    options: FindOptions,
  ) => FindOutcome;
  onWatchFindInPane: (paneId: string, onResults: (results: FindResults) => void) => () => void;
  filterMode: boolean;
  matchCount: number;
  onFilterInPane: (paneId: string, query: string | null) => void;
  onToggleFilterMode: () => void;
  onCloseSearch: () => void;
}

function PaneViewImpl(props: PaneViewProps) {
  const {
    pane,
    projectName,
    projectLabel,
    visible,
    focused,
    fullscreen,
    searchActive,
    searchFocusRequest,
    canClose,
    fontSize,
    composerOpen,
    themeOverride,
    paneStatus,
    services = [],
    allTerminals,
    interactiveCwd,
    onFocusPane,
    onFocusTab,
    onFocusService,
    onStopService,
    onRestartService,
    onEditService,
    onAddTerminal,
    newTabProject,
    onLaunchAgent,
    onRunCommand,
    onRunAction,
    newTabPaneId,
    onNewTabHandled,
    onAddBrowser,
    onReviewChanges,
    onAddToolkit,
    onAddFiles,
    onAddAutomations,
    onResumeSession,
    onCloseTerminal,
    onCloseOtherTerminals,
    onRestartTerminal,
    onForkTerminal,
    canForkIntoCopy,
    onForkTerminalIntoCopy,
    onRenameTerminal,
    onRestoreSessionTitle,
    onTogglePinTab,
    onSplit,
    onClosePane,
    onToggleUtility,
    onToggleFullscreen,
    onRegisterTerminalHandle,
    onRegisterServiceHandle,
    onClearStatus,
    onSubmitInput,
    onFocusTerminalInput,
    onRunInDuplicates,
    onOpenMemorySession,
    onDetachMemory,
    memoryTarget,
    agentSessionsReadable,
    onFindInPane,
    onWatchFindInPane,
    filterMode,
    matchCount,
    onFilterInPane,
    onToggleFilterMode,
    onCloseSearch,
  } = props;

  const [tabMenu, setTabMenu] = useState<{
    paneId: string;
    tabIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const [serviceMenu, setServiceMenu] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [renamingTabIdx, setRenamingTabIdx] = useState<number | null>(null);

  const hasMultipleServices = services.length > 1;
  const browserServices = useMemo(
    () => services.filter((s) => !s.exited).flatMap((s) => (s.ports ?? []).map((port) => ({ name: s.name, port }))),
    [services],
  );
  const isAllActive =
    pane.activeServiceName === ALL_SERVICES && hasMultipleServices;
  const namedServiceName =
    pane.activeServiceName &&
    services.some((s) => s.name === pane.activeServiceName)
      ? pane.activeServiceName
      : null;
  const activeServiceName: string | null = isAllActive
    ? ALL_SERVICES
    : namedServiceName;
  const terminalIdx =
    pane.tabs.length === 0
      ? -1
      : Math.min(pane.activeTabIdx, pane.tabs.length - 1);
  const activeTerm = terminalIdx >= 0 ? pane.tabs[terminalIdx] : null;
  const activeUtilityTab: UtilityTabKind | null =
    activeServiceName === null &&
    (activeTerm?.kind === "memory" ||
      activeTerm?.kind === "toolkit" ||
      activeTerm?.kind === "files" ||
      activeTerm?.kind === "automations")
      ? activeTerm.kind
      : null;
  const paneActions = usePaneToolbar({
    resume: !!onResumeSession,
    automations: !!onAddAutomations,
  });
  // From the menu an action opens its tab; from a toolbar button it toggles,
  // so the button both shows and dismisses the tab.
  const runPaneAction = useCallback(
    (id: PaneActionId, fromToolbar: boolean) => {
      switch (id) {
        case "review":
          return onReviewChanges(pane.id);
        case "files":
          return fromToolbar ? onToggleUtility(pane.id, "files") : onAddFiles(pane.id);
        case "toolkit":
          return fromToolbar ? onToggleUtility(pane.id, "toolkit") : onAddToolkit(pane.id);
        case "automations":
          return fromToolbar ? onToggleUtility(pane.id, "automations") : onAddAutomations?.(pane.id);
        case "browser":
          return onAddBrowser(pane.id);
        case "resume":
          return onResumeSession?.();
      }
    },
    [pane.id, onToggleUtility, onReviewChanges, onAddFiles, onAddToolkit, onAddAutomations, onAddBrowser, onResumeSession],
  );
  const composerTab =
    activeServiceName === null && activeTerm && isTerminalTab(activeTerm)
      ? activeTerm
      : null;
  const composerStatus = paneAgentStatus(paneStatus, composerTab?.id);
  const composerAgent = composerTab
    ? composerAgentName(
        composerTab.startCmd ?? composerTab.resumeCmd,
        paneStatus?.providers.get(composerTab.id),
      )
    : null;
  // A status report or a conversation title both mean the agent has taken a
  // prompt; the title outlasts a Done the user has already cleared.
  const composerStarted = composerStatus !== null || !!composerTab?.sessionTitle;
  const composerEnded = useEndedTerminals((s) =>
    composerTab && composerTab.id in s.ended ? s.ended[composerTab.id] : undefined,
  );
  const composerForkable = composerTab !== null && canForkSession(composerTab.resumeCmd);
  // The agent conversation behind the active terminal, when its transcript is
  // readable: a connected computer's terminal too, since the project's marked
  // name sends each read to the machine both are on.
  const projectPeer = peerSlugOf(projectName);
  const composerSession =
    agentSessionsReadable && composerTab && peerSlugOf(composerTab.id) === projectPeer
      ? agentSessionOf(composerTab)
      : null;

  // A finish that lands on the tab already in front is the easiest one to miss:
  // it arrives while the user is somewhere else entirely. So the badge stays put
  // on the active tab and is retired by the first deliberate input instead of by
  // the tab merely being selected.
  const attentionKinds: StatusKind[] = [];
  if (visible && focused && activeServiceName === null && activeTerm) {
    if (paneStatus?.done.has(activeTerm.id)) attentionKinds.push("Done");
    if (paneStatus?.error.has(activeTerm.id)) attentionKinds.push("Error");
  }
  useClearStatusOnInteraction(
    activeTerm?.id ?? null,
    attentionKinds,
    onClearStatus,
  );

  const tabIds = useMemo(() => pane.tabs.map((t) => t.id), [pane.tabs]);
  const tabCommands = useTerminalCommands(useShallow((s) => pickCommands(s.byId, tabIds)));
  const filesViews = useFilesView((s) => s.views);

  const { ref: scrollRef, canScrollLeft, canScrollRight } = useScrollFade<HTMLDivElement>([
    pane.tabs,
    services,
    activeServiceName,
  ]);
  useWheelScrollX(scrollRef);

  // Keep the focused tab on screen. The margin clears the overflow chip and
  // its fade at each edge so the tab isn't left half-hidden under them.
  const scrollTabIntoView = useCallback(
    (tab: HTMLElement | null, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      if (!container || !tab) return;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const next = computeScrollIntoViewLeft({
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth,
        elementLeft: tabRect.left - containerRect.left + container.scrollLeft,
        elementWidth: tabRect.width,
        margin: STRIP_EDGE_ZONE + 12,
      });
      if (next !== null) container.scrollTo({ left: next, behavior });
    },
    [scrollRef],
  );

  const activateTab = (i: number) => {
    const id = pane.tabs[i].id;
    if (paneStatus?.done.has(id)) onClearStatus(id, "Done");
    if (paneStatus?.error.has(id)) onClearStatus(id, "Error");
    onFocusTab(pane.id, i);
  };
  const stripOverflow = usePaneStripOverflow({
    scrollRef,
    edges: { left: canScrollLeft, right: canScrollRight },
    services,
    tabs: pane.tabs,
    filesViews,
    tabIcon: (t) => <TabIcon tab={t} />,
    onSelectService: (name) => onFocusService(pane.id, name),
    onSelectTab: activateTab,
    scrollIntoView: scrollTabIntoView,
    deps: [pane.tabs, services, activeServiceName],
  });

  // Covers activation that changes state (reuse landing on a different tab,
  // keyboard switches) and explicit reuse requests for the already-active tab
  // (scrollNonce), which change no pane state. Clicks scroll imperatively
  // below, since re-clicking the active tab also wouldn't re-run this effect.
  const scrollNonce = useTabScroll((s) => s.nonce[pane.id] ?? 0);
  useEffect(() => {
    scrollTabIntoView(
      scrollRef.current?.querySelector<HTMLElement>("[data-active-tab]") ?? null,
    );
  }, [scrollTabIntoView, terminalIdx, activeServiceName, pane.tabs.length, scrollNonce]);

  // A strip that gets narrower (window resize, sidebar, a split, a hidden
  // project shown again) would otherwise leave the active tab off the edge.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      scrollTabIntoView(container.querySelector<HTMLElement>("[data-active-tab]"), "instant"),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRef, scrollTabIntoView]);

  const windowFullscreen = useIsFullscreen();
  const containerClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
    : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-x border-[var(--border)]";

  const headerClass = `flex items-center gap-0.5 bg-[var(--terminal-header)] ${paneHeaderPadding(
    fullscreen,
    isMac,
    windowFullscreen,
  )} py-1 border-b-1 ${
    focused && canClose
      ? "border-b-[var(--accent-cyan)]"
      : "border-b-[var(--terminal-header-hover)]"
  }`;

  return (
    <div
      className={containerClass}
      onMouseDownCapture={() => onFocusPane(pane.id)}
    >
      <div className={headerClass}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <div
            ref={scrollRef}
            className="no-scrollbar flex w-full min-w-0 items-center gap-0.5 overflow-x-auto"
          >
          {hasMultipleServices && (
            <HeaderTab
              label="All"
              icon={<Columns2 size={14} />}
              active={isAllActive}
              stripKey={ALL_STRIP_KEY}
              onClick={(e) => {
                onFocusService(pane.id, ALL_SERVICES);
                scrollTabIntoView(e.currentTarget);
              }}
            />
          )}
          {services.map((svc) => {
            const isActive = activeServiceName === svc.name;
            const ports = svc.ports ?? [];
            return (
              <HeaderTab
                key={`svc:${svc.name}`}
                label={svc.name}
                icon={<ZapIcon />}
                active={isActive}
                stripKey={serviceStripKey(svc.name)}
                trailing={
                  svc.exited ? (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        serviceCrashed(svc) ? "bg-[var(--accent-red)]" : "bg-[var(--text-muted)]"
                      }`}
                    />
                  ) : (
                    ports.length > 0 && (
                      <ServicePortLinks
                        projectName={projectName}
                        ports={ports}
                        service={svc.name}
                        paneId={pane.id}
                        configuredPort={svc.configuredPort}
                      />
                    )
                  )
                }
                onClick={(e) => {
                  onFocusService(pane.id, svc.name);
                  scrollTabIntoView(e.currentTarget);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setServiceMenu({ name: svc.name, x: e.clientX, y: e.clientY });
                }}
              />
            );
          })}
          {services.length > 0 && pane.tabs.length > 0 && (
            <div className="mx-1.5 h-3 w-px shrink-0 bg-[var(--terminal-header-border)] opacity-25" />
          )}
          <TabStrip paneId={pane.id} tabIds={tabIds}>
            {pane.tabs.map((t, i) => {
              const isActive = activeServiceName === null && i === terminalIdx;
              const isDone = paneStatus?.done.has(t.id) ?? false;
              // Waiting persists across tab clicks, unlike Done and Error: the
              // dialog is still open, and answering it is what ends the wait.
              const isWaiting = paneStatus?.waiting.has(t.id) ?? false;
              const isError = paneStatus?.error.has(t.id) ?? false;
              // Done/Error render on the active tab as well; retiring them is
              // the interaction handler's call, not the renderer's.
              return (
                <SortableTab key={t.id} id={t.id} paneId={pane.id} index={i}>
                  <HeaderTab
                    label={
                      t.kind === "files"
                        ? filesTabLabel(t, filesViews[t.id] === "changes")
                        : terminalStripLabel(t, tabCommands[t.id])
                    }
                    origin={terminalOriginLabel(t)}
                    fork={t.forkOf}
                    command={tabCommandDetails(t, tabCommands[t.id])}
                    icon={<TabIcon tab={t} />}
                    active={isActive}
                    stripKey={terminalStripKey(t.id)}
                    pinned={t.pinned}
                    shimmer={paneStatus?.running.has(t.id) ?? false}
                    done={isDone}
                    waiting={isWaiting}
                    error={isError}
                    agentStatus={paneAgentStatus(paneStatus, t.id)}
                    color={t.color}
                    trailing={
                      <>
                        <CommandMarkIcon mark={tabCommandMark(t, tabCommands[t.id])} />
                        <SharedTabMark terminalId={t.id} />
                        <SendLaterTabMark historyKey={t.historyKey} />
                      </>
                    }
                    onClick={(e) => {
                      activateTab(i);
                      scrollTabIntoView(e.currentTarget);
                    }}
                    onClose={() => onCloseTerminal(pane.id, i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabMenu({ paneId: pane.id, tabIdx: i, x: e.clientX, y: e.clientY });
                    }}
                  />
                </SortableTab>
              );
            })}
          </TabStrip>
          <AddTerminalButton
            project={newTabProject}
            onAddTerminal={() => onAddTerminal(pane.id)}
            onRunCommand={(command) => onRunCommand(pane.id, command)}
            onOpenAgent={(launch) => onLaunchAgent(pane.id, launch)}
            onRunAction={(action, opts) => onRunAction(pane.id, action, opts)}
            onResumeSession={onResumeSession}
            openRequested={newTabPaneId === pane.id}
            onOpenRequestHandled={onNewTabHandled}
          />
          </div>
          <ScrollFadeEdges
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            from="from-[var(--terminal-header)]"
          />
          {stripOverflow.left.length > 0 && (
            <TabOverflowChip side="left" entries={stripOverflow.left} onSelect={stripOverflow.select} />
          )}
          {stripOverflow.right.length > 0 && (
            <TabOverflowChip side="right" entries={stripOverflow.right} onSelect={stripOverflow.select} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {paneActions.menu.length > 0 && (
            <PaneMenuButton
              actions={paneActions.menu}
              isDefault={paneActions.isDefault}
              onRun={(id) => runPaneAction(id, false)}
              onMove={(id) => paneActions.move(id, true)}
              onReset={paneActions.reset}
            />
          )}
          {composerTab && (
            <PaneShareButton
              terminalId={composerTab.id}
              project={projectName}
              label={terminalDisplayLabel(composerTab)}
            />
          )}
          <Tooltip
            content={
              <>
                Split right <span className="ml-1 opacity-70">{chordLabel({ key: "d", meta: true })}</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn onClick={() => onSplit(pane.id, "row")} ariaLabel="Split right">
              <SplitRightIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip
            content={
              <>
                Split down <span className="ml-1 opacity-70">{chordLabel({ key: "d", meta: true, shift: true })}</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn onClick={() => onSplit(pane.id, "col")} ariaLabel="Split down">
              <SplitDownIcon />
            </IconBtn>
          </Tooltip>
          <PaneToolbar
            actions={paneActions.toolbar}
            activeTab={activeUtilityTab}
            isDefault={paneActions.isDefault}
            onRun={(id) => runPaneAction(id, true)}
            onMove={(id) => paneActions.move(id, false)}
            onReset={paneActions.reset}
          />
          <Tooltip
            content={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onToggleFullscreen(pane.id)}
              ariaLabel={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </IconBtn>
          </Tooltip>
          {canClose && (
            <Tooltip
              content={closePaneTooltip(pane.tabs, runningAgentCount(pane.tabs, paneStatus?.running))}
              side="bottom"
              align="end"
            >
              <IconBtn onClick={() => onClosePane(pane.id)} ariaLabel="Close pane">
                <XIcon />
              </IconBtn>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${isAllActive ? "divide-x divide-[var(--border)]" : ""}`}
      >
        {searchActive && (
          <TerminalSearchBar
            key={`${pane.id}:${activeServiceName ?? activeTerm?.id ?? "empty"}`}
            filterMode={filterMode}
            matchCount={matchCount}
            onFind={(query, direction, options) => onFindInPane(pane.id, query, direction, options)}
            onWatchResults={(onResults) => onWatchFindInPane(pane.id, onResults)}
            onFilterChange={(query) => onFilterInPane(pane.id, query)}
            onToggleFilterMode={onToggleFilterMode}
            onClose={onCloseSearch}
            focusRequest={searchFocusRequest}
          />
        )}
        {services.map((svc) => {
          const isVisible = isAllActive || activeServiceName === svc.name;
          return (
            <div
              key={`svc:${svc.name}`}
              className={
                isVisible
                  ? `flex min-h-0 flex-1 flex-col overflow-hidden ${isAllActive ? "min-w-40" : "min-w-0"}`
                  : "hidden"
              }
            >
              <Pane
                ref={(el) => onRegisterServiceHandle(svc.name, el)}
                sessionKey={svc.sessionKey}
                output={svc.output}
                visible={visible && isVisible}
                fontSize={fontSize}
                themeOverride={themeOverride}
                cwd={svc.cwd}
                label={svc.name}
                labelLead={<ServiceStateDot exited={svc.exited} exitCode={svc.exitCode} />}
                labelHint={svc.cmd}
                labelDetail={svc.cmd ? <ServiceCommand cmd={svc.cmd} /> : undefined}
                labelActions={
                  <ServiceColumnActions
                    projectName={projectName}
                    paneId={pane.id}
                    name={svc.name}
                    ports={svc.ports ?? []}
                    configuredPort={svc.configuredPort}
                    exited={svc.exited ?? false}
                    onRestart={() => onRestartService(svc.name)}
                    onStop={() => onStopService(svc.name)}
                    onEdit={onEditService ? () => onEditService(svc.name) : undefined}
                  />
                }
                onLabelClick={
                  isAllActive
                    ? () => onFocusService(pane.id, svc.name)
                    : undefined
                }
              />
              {svc.exited && (
                <ServiceExitBar
                  name={svc.name}
                  exitCode={svc.exitCode ?? null}
                  onRestart={() => onRestartService(svc.name)}
                />
              )}
            </div>
          );
        })}
        {pane.tabs.map((t, i) => {
          const isActive = activeServiceName === null && i === terminalIdx;
          return (
            <div
              key={t.id}
              className={
                isActive
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : "hidden"
              }
            >
              {t.kind === "browser" ? (
                IS_MIRROR_WINDOW ? (
                  <BrowserMirrorPlaceholder />
                ) : (
                  <BrowserPane
                    id={t.id}
                    projectName={projectName}
                    projectLabel={projectLabel}
                    active={visible && isActive}
                    services={browserServices}
                  />
                )
              ) : t.kind === "memory" ? (
                <MemoryView
                  projectName={projectName}
                  visible={visible && isActive}
                  focused={focused}
                  target={memoryTarget}
                />
              ) : t.kind === "toolkit" ? (
                <ErrorBoundary resetKey={t.id} scope="toolkit">
                  <ToolkitView
                    cwd={interactiveCwd}
                    visible={visible && isActive}
                    focused={focused}
                  />
                </ErrorBoundary>
              ) : t.kind === "files" ? (
                <ErrorBoundary resetKey={t.id} scope="files">
                  <FilesPane
                    key={interactiveCwd}
                    tabId={t.id}
                    paneId={pane.id}
                    projectRoot={interactiveCwd}
                    projectName={projectName}
                    active={visible && isActive}
                    focused={focused}
                  />
                </ErrorBoundary>
              ) : t.kind === "automations" ? (
                <ErrorBoundary resetKey={t.id} scope="automations">
                  <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)] px-6">
                    <ScheduledView
                      project={projectName}
                      visible={visible && isActive}
                      focused={focused}
                    />
                  </div>
                </ErrorBoundary>
              ) : (
                <InteractiveTab
                  terminalId={t.id}
                  visible={visible && isActive}
                  fontSize={fontSize}
                  themeOverride={themeOverride}
                  cwd={interactiveCwd}
                  paneRef={(el) => onRegisterTerminalHandle(t.id, el)}
                />
              )}
            </div>
          );
        })}
      </div>
      {composerSession && (
        // Zero-height rail on the seam between the terminal and the composer,
        // so the pill can hang below the terminal's clipped content box.
        <div className="relative h-0">
          <TerminalCopyAnswerOverlay
            projectName={projectName}
            session={composerSession}
            // Hidden only while the agent is visibly producing the next
            // answer. Anything else — waiting, done, error, or no status
            // reported at all — leaves the last answer worth copying.
            show={composerStatus?.state !== "working"}
          />
        </div>
      )}
      {composerTab && composerEnded !== undefined ? (
        <TerminalEndedBar
          targetLabel={terminalDisplayLabel(composerTab)}
          exitCode={composerEnded}
          onRestart={IS_MIRROR_WINDOW ? undefined : () => onRestartTerminal(composerTab.id)}
          onClose={() => {
            const idx = pane.tabs.findIndex((t) => t.id === composerTab.id);
            if (idx >= 0) onCloseTerminal(pane.id, idx);
          }}
        />
      ) : composerTab &&
        (composerOpen ? (
          // Keyed by terminal id so each terminal keeps its own draft and the
          // input refocuses when the active terminal changes.
          <TerminalComposer
            key={composerTab.id}
            terminalId={composerTab.id}
            historyKey={composerTab.historyKey ?? composerTab.id}
            projectName={projectName}
            shown={visible}
            focused={focused}
            targetLabel={terminalDisplayLabel(composerTab)}
            agent={composerAgent}
            agentStarted={composerStarted}
            terminals={allTerminals}
            session={composerSession}
            cwd={interactiveCwd}
            launchCmd={composerTab.startCmd ?? composerTab.resumeCmd}
            actionName={composerTab.actionName}
            fontSize={fontSize}
            canFork={composerForkable}
            onFork={() => onForkTerminal(pane.id, composerTab.id)}
            canForkCopy={composerForkable && canForkIntoCopy}
            onForkCopy={() =>
              onForkTerminalIntoCopy(pane.id, composerTab.id, terminalDisplayLabel(composerTab))
            }
            onSubmit={(input) => onSubmitInput(composerTab.id, input)}
            onFocusTerminal={() => onFocusTerminalInput(composerTab.id)}
            onRunInDuplicates={onRunInDuplicates}
            onOpenMemorySession={onOpenMemorySession}
            memory={composerTab.memory}
            onDetachMemory={() => onDetachMemory(composerTab.id)}
          />
        ) : (
          // Input closed: leave a slim stand-in that reopens it (same as ⌘I).
          <ComposerReopenBar
            targetLabel={terminalDisplayLabel(composerTab)}
            agent={composerAgent}
            agentStarted={composerStarted}
            fontSize={fontSize}
            agentStatus={composerStatus}
          />
        ))}
      {tabMenu && (() => {
        const targetPane = pane.id === tabMenu.paneId ? pane : null;
        const tab = targetPane?.tabs[tabMenu.tabIdx];
        if (!tab) return null;
        const canCloseOthers = targetPane.tabs.some(
          (t, i) => i !== tabMenu.tabIdx && t.pinned !== true,
        );
        const forkable = isTerminalTab(tab) && canForkSession(tab.resumeCmd);
        return (
          <TabContextMenu
            x={tabMenu.x}
            y={tabMenu.y}
            pinned={tab.pinned === true}
            canShare={isTerminalTab(tab)}
            onShare={() =>
              useTabShares.getState().openShareDialog({
                terminalId: tab.id,
                project: projectName,
                label: terminalDisplayLabel(tab),
                anchor: { left: tabMenu.x, top: tabMenu.y, right: tabMenu.x, bottom: tabMenu.y },
              })
            }
            canFork={forkable}
            canForkCopy={forkable && canForkIntoCopy}
            canCloseOthers={canCloseOthers}
            onRename={() => setRenamingTabIdx(tabMenu.tabIdx)}
            canRestoreSessionTitle={
              isTerminalTab(tab) &&
              !followsAgentTitle(tab) &&
              !!agentSessionOf(tab)
            }
            onRestoreSessionTitle={() =>
              onRestoreSessionTitle(tabMenu.paneId, tabMenu.tabIdx)
            }
            onTogglePin={() => onTogglePinTab(tabMenu.paneId, tabMenu.tabIdx)}
            onFork={() => onForkTerminal(tabMenu.paneId, tab.id)}
            onForkCopy={() =>
              onForkTerminalIntoCopy(
                tabMenu.paneId,
                tab.id,
                terminalDisplayLabel(tab),
              )
            }
            onCloseTab={() => onCloseTerminal(tabMenu.paneId, tabMenu.tabIdx)}
            onCloseOthers={() => onCloseOtherTerminals(tabMenu.paneId, tabMenu.tabIdx)}
            onClose={() => setTabMenu(null)}
          />
        );
      })()}
      {serviceMenu && (() => {
        const svc = services.find((s) => s.name === serviceMenu.name);
        if (!svc) return null;
        return (
          <ServiceTabContextMenu
            x={serviceMenu.x}
            y={serviceMenu.y}
            ports={svc.ports ?? []}
            projectName={projectName}
            service={svc.name}
            paneId={pane.id}
            onRestart={() => onRestartService(svc.name)}
            onStop={() => onStopService(svc.name)}
            onClose={() => setServiceMenu(null)}
          />
        );
      })()}
      <RenameModal
        open={renamingTabIdx !== null}
        title="Rename tab"
        withEmoji={
          renamingTabIdx !== null &&
          !!pane.tabs[renamingTabIdx] &&
          isTerminalTab(pane.tabs[renamingTabIdx])
        }
        initialValue={
          renamingTabIdx !== null && pane.tabs[renamingTabIdx]
            ? terminalDisplayLabel(pane.tabs[renamingTabIdx])
            : ""
        }
        initialEmoji={
          renamingTabIdx !== null ? pane.tabs[renamingTabIdx]?.emoji ?? "" : ""
        }
        onClose={() => setRenamingTabIdx(null)}
        onSubmit={(value, emoji) => {
          if (renamingTabIdx !== null)
            onRenameTerminal(pane.id, renamingTabIdx, value, emoji);
        }}
      />
    </div>
  );
}

// Memoize so divider drag (which only touches nodes along the split
// path) doesn't re-render panes whose leaf reference is stable. Parent
// must pass stable callback references for this to take effect.
export const PaneView = memo(PaneViewImpl);
