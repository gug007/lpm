import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { type InteractivePaneHandle } from "./InteractivePane";
import { InteractiveTab } from "./InteractiveTab";
import { BrowserPane } from "./BrowserPane";
import { BrowserMirrorPlaceholder } from "./BrowserMirrorPlaceholder";
import { IS_MIRROR_WINDOW } from "../mirror";
import { DiffReviewPane } from "./review/DiffReviewPane";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Pane, type PaneHandle } from "./Pane";
import { HeaderTab } from "./terminal/HeaderTab";
import { RenameModal } from "./RenameModal";
import { TabContextMenu } from "./terminal/TabContextMenu";
import { ServiceTabContextMenu } from "./terminal/ServiceTabContextMenu";
import { IconBtn } from "./terminal/IconBtn";
import {
  SplitRightIcon,
  SplitDownIcon,
  ClearIcon,
  ExpandIcon,
  ShrinkIcon,
} from "./terminal/icons";
import { AddTabSplitButton } from "./terminal/AddTabSplitButton";
import { TerminalSearchBar } from "./terminal/TerminalSearchBar";
import { XIcon, GlobeIcon, TerminalIcon, ZapIcon, CodeIcon } from "./icons";
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
  isTerminalTab,
  type PaneLeaf,
  type SplitDirection,
  type TerminalInstance,
} from "../paneTree";
import { useBrowserUrls } from "../store/browserUrls";
import { canForkSession } from "../forkSession";
import { actionTextColor } from "../actionColors";

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

function TabIcon({ tab }: { tab: TerminalInstance }) {
  if (tab.kind === "browser") return <BrowserTabIcon id={tab.id} />;
  if (tab.kind === "review") return <CodeIcon />;
  if (tab.emoji)
    return (
      <span
        className="flex h-3.5 w-3.5 items-center justify-center text-[12px] leading-none"
        style={{ color: actionTextColor(tab.color) }}
      >
        {tab.emoji}
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
}

export interface PaneViewProps {
  pane: PaneLeaf;
  projectName: string;
  visible: boolean;
  focused: boolean;
  fullscreen: boolean;
  searchActive: boolean;
  canClose: boolean;
  fontSize: number;
  composerOpen: boolean;
  themeOverride: ITheme | null;
  runningPaneIDs?: Set<string>;
  donePaneIDs?: Set<string>;
  waitingPaneIDs?: Set<string>;
  errorPaneIDs?: Set<string>;
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
  onAddTerminal: (paneId: string) => void;
  onAddBrowser: (paneId: string) => void;
  onAddReview: (paneId: string) => void;
  onResumeSession?: () => void;
  onCloseTerminal: (paneId: string, tabIdx: number) => void;
  onCloseOtherTerminals: (paneId: string, tabIdx: number) => void;
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
  onTogglePinTab: (paneId: string, tabIdx: number) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onClearPane: (paneId: string) => void;
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
  onFindInPane: (paneId: string, query: string, direction: "next" | "prev") => boolean;
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
    visible,
    focused,
    fullscreen,
    searchActive,
    canClose,
    fontSize,
    composerOpen,
    themeOverride,
    runningPaneIDs,
    donePaneIDs,
    waitingPaneIDs,
    errorPaneIDs,
    services = [],
    allTerminals,
    interactiveCwd,
    onFocusPane,
    onFocusTab,
    onFocusService,
    onStopService,
    onAddTerminal,
    onAddBrowser,
    onAddReview,
    onResumeSession,
    onCloseTerminal,
    onCloseOtherTerminals,
    onForkTerminal,
    canForkIntoCopy,
    onForkTerminalIntoCopy,
    onRenameTerminal,
    onTogglePinTab,
    onSplit,
    onClosePane,
    onClearPane,
    onToggleFullscreen,
    onRegisterTerminalHandle,
    onRegisterServiceHandle,
    onClearStatus,
    onSubmitInput,
    onFocusTerminalInput,
    onRunInDuplicates,
    onFindInPane,
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
  const composerTab =
    activeServiceName === null && activeTerm && isTerminalTab(activeTerm)
      ? activeTerm
      : null;

  useEffect(() => {
    if (!visible || !focused || activeServiceName !== null || !activeTerm)
      return;
    if (donePaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Done");
    if (errorPaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Error");
  }, [
    visible,
    focused,
    activeServiceName,
    activeTerm,
    donePaneIDs,
    errorPaneIDs,
    onClearStatus,
  ]);

  const tabIds = useMemo(() => pane.tabs.map((t) => t.id), [pane.tabs]);

  const { ref: scrollRef, canScrollLeft, canScrollRight } = useScrollFade<HTMLDivElement>([
    pane.tabs,
    services,
    activeServiceName,
  ]);
  useWheelScrollX(scrollRef);

  // Keep the focused tab on screen. The margin clears the w-6 fade gradient at
  // each edge so the tab isn't left half-hidden under it.
  const scrollTabIntoView = useCallback(
    (tab: HTMLElement | null) => {
      const container = scrollRef.current;
      if (!container || !tab) return;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const next = computeScrollIntoViewLeft({
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth,
        elementLeft: tabRect.left - containerRect.left + container.scrollLeft,
        elementWidth: tabRect.width,
        margin: 28,
      });
      if (next !== null) container.scrollTo({ left: next, behavior: "smooth" });
    },
    [scrollRef],
  );

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

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
    : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-x border-[var(--border)]";

  const headerClass = `flex items-center gap-0.5 bg-[var(--terminal-header)] px-2 py-1 border-b-1 ${
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
                trailing={
                  ports.length > 0 && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-60">
                      {ports.map((p) => `:${p}`).join(" ")}
                    </span>
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
              const isDone = donePaneIDs?.has(t.id) ?? false;
              // Waiting persists across tab clicks (user memory) so we don't
              // auto-clear it here, unlike Done/Error.
              const isWaiting = waitingPaneIDs?.has(t.id) ?? false;
              const isError = errorPaneIDs?.has(t.id) ?? false;
              return (
                <SortableTab key={t.id} id={t.id} paneId={pane.id} index={i}>
                  <HeaderTab
                    label={t.label}
                    icon={<TabIcon tab={t} />}
                    active={isActive}
                    pinned={t.pinned}
                    shimmer={runningPaneIDs?.has(t.id) ?? false}
                    done={!isActive && isDone}
                    waiting={isWaiting}
                    error={!isActive && isError}
                    color={t.color}
                    onClick={(e) => {
                      if (isDone) onClearStatus(t.id, "Done");
                      if (isError) onClearStatus(t.id, "Error");
                      onFocusTab(pane.id, i);
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
          <AddTabSplitButton
            onAddTerminal={() => onAddTerminal(pane.id)}
            onAddBrowser={() => onAddBrowser(pane.id)}
            onAddReview={() => onAddReview(pane.id)}
            onResumeSession={onResumeSession}
          />
          </div>
          {canScrollLeft && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[var(--terminal-header)] to-transparent" />
          )}
          {canScrollRight && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--terminal-header)] to-transparent" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip
            content={
              <>
                Split right <span className="ml-1 opacity-70">⌘D</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onSplit(pane.id, "row")}
              title="Split right (⌘D)"
            >
              <SplitRightIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip
            content={
              <>
                Split down <span className="ml-1 opacity-70">⌘⇧D</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onSplit(pane.id, "col")}
              title="Split down (⌘⇧D)"
            >
              <SplitDownIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip content="Clear" side="bottom" align="end">
            <IconBtn onClick={() => onClearPane(pane.id)} title="Clear">
              <ClearIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip
            content={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onToggleFullscreen(pane.id)}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </IconBtn>
          </Tooltip>
          {canClose && (
            <Tooltip content="Close pane" side="bottom" align="end">
              <IconBtn onClick={() => onClosePane(pane.id)} title="Close pane">
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
            onFindNext={(query) => onFindInPane(pane.id, query, "next")}
            onFindPrevious={(query) => onFindInPane(pane.id, query, "prev")}
            onFilterChange={(query) => onFilterInPane(pane.id, query)}
            onToggleFilterMode={onToggleFilterMode}
            onClose={onCloseSearch}
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
                label={isAllActive ? svc.name : undefined}
                onLabelClick={
                  isAllActive
                    ? () => onFocusService(pane.id, svc.name)
                    : undefined
                }
              />
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
                  <BrowserPane id={t.id} active={visible && isActive} />
                )
              ) : t.kind === "review" ? (
                <ErrorBoundary resetKey={t.id} scope="diff-review">
                  <DiffReviewPane
                    projectRoot={interactiveCwd}
                    active={visible && isActive}
                  />
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
      {composerTab &&
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
            targetLabel={composerTab.label}
            terminals={allTerminals}
            cwd={interactiveCwd}
            launchCmd={composerTab.startCmd ?? composerTab.resumeCmd}
            actionName={composerTab.actionName}
            fontSize={fontSize}
            onSubmit={(input) => onSubmitInput(composerTab.id, input)}
            onFocusTerminal={() => onFocusTerminalInput(composerTab.id)}
            onRunInDuplicates={onRunInDuplicates}
          />
        ) : (
          // Input closed: leave a slim stand-in that reopens it (same as ⌘I).
          <ComposerReopenBar targetLabel={composerTab.label} fontSize={fontSize} />
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
            canFork={forkable}
            canForkCopy={forkable && canForkIntoCopy}
            canCloseOthers={canCloseOthers}
            onRename={() => setRenamingTabIdx(tabMenu.tabIdx)}
            onTogglePin={() => onTogglePinTab(tabMenu.paneId, tabMenu.tabIdx)}
            onFork={() => onForkTerminal(tabMenu.paneId, tab.id)}
            onForkCopy={() => onForkTerminalIntoCopy(tabMenu.paneId, tab.id, tab.label)}
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
          renamingTabIdx !== null
            ? pane.tabs[renamingTabIdx]?.label ?? ""
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
