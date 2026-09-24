"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import {
  Code,
  Columns2,
  Eraser,
  Folder,
  Globe,
  Maximize2,
  Minimize2,
  Pin,
  Rows2,
  Terminal as TerminalIcon,
  X,
  Zap,
} from "lucide-react";
import type { AgentStatus } from "./agent-terminal";
import { IconBtn } from "./icon-btn";
import { PANE_ACTION_META, type UtilityTabKind } from "./pane-action-meta";
import type { PaneActionId } from "./pane-actions";
import { PaneMenuButton } from "./pane-menu-button";
import { PaneToolbarButton } from "./pane-toolbar-button";
import { AddTabButton } from "./tab-controls";
import { Tooltip } from "./tooltip";
import { FOCUS_RING } from "./ui";

// Partial so a status added to AgentStatus can't break the header; "waiting" is
// listed ahead of that because the app's HeaderTab already styles it.
const STATUS_LABEL_CLASS: Record<AgentStatus, string> = {
  running: "sidebar-shimmer",
  waiting: "sidebar-waiting",
  done: "text-[#60a5fa]",
  error: "text-[#f87171]",
};

export type TabInfo = {
  key: string;
  label: string;
  type: "all" | "service" | "terminal" | "browser" | "review" | "files";
  port?: number;
  running: boolean;
  emoji?: string;
  pinned?: boolean;
  status?: AgentStatus;
  closable?: boolean;
};

/** The header's pane actions: which sit on the toolbar, which are left in the
 *  "more" menu, and the moves between them. Absent where a pane has nothing to
 *  open — the global Terminals view has no project behind it. */
export type PaneActionsProps = {
  menu: PaneActionId[];
  toolbar: PaneActionId[];
  isDefault: boolean;
  // The utility tab the pane is showing, if any: its button lights up.
  activeTab: UtilityTabKind | null;
  onRun: (id: PaneActionId, fromToolbar: boolean) => void;
  onMove: (id: PaneActionId, toToolbar: boolean) => void;
  onReset: () => void;
};

type PaneHeaderProps = {
  tabs: TabInfo[];
  activeIdx: number;
  focused?: boolean;
  onSelectTab: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onNewTab?: () => void;
  onOpenPort: (port: number) => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onClear?: () => void;
  paneActions?: PaneActionsProps;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClosePane?: () => void;
  onTabContextMenu?: (idx: number, x: number, y: number) => void;
};

export function PaneHeader({
  tabs,
  activeIdx,
  focused = true,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenPort,
  onSplitRight,
  onSplitDown,
  onClear,
  paneActions,
  fullscreen = false,
  onToggleFullscreen,
  onClosePane,
  onTabContextMenu,
}: PaneHeaderProps) {
  // Only a split tree has a pane worth singling out, so the cyan focus edge
  // rides on the close control the split also brings.
  const canClose = !!onClosePane;
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  // Scrolls the strip itself rather than calling scrollIntoView, which walks up
  // to the document and would jump the marketing page under the visitor.
  useEffect(() => {
    const strip = stripRef.current;
    const pill = activeTabRef.current;
    if (!strip || !pill) return;
    const left = pill.offsetLeft;
    const right = left + pill.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = right - strip.clientWidth;
    }
  }, [activeIdx, tabs.length]);
  return (
    <div
      className={`flex-shrink-0 flex items-center gap-0.5 border-b bg-[#2d2d2d] px-2 py-1 ${
        focused && canClose
          ? "border-b-[#22d3ee]"
          : "border-b-[rgba(255,255,255,0.06)]"
      }`}
    >
      <div
        ref={stripRef}
        className="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          const port = tab.port;
          const pinned = tab.pinned === true;
          const closable = tab.closable !== false && !pinned;
          const canContext = tab.type !== "service" && tab.type !== "all";
          const onContext = (e: MouseEvent) => {
            if (!canContext || !onTabContextMenu) return;
            e.preventDefault();
            onTabContextMenu(i, e.clientX, e.clientY);
          };
          // The tab icon gives way to the close (or pin) affordance on hover
          // rather than sitting beside it, inside a fixed 14px slot: emoji and
          // glyph icons are narrower than the X, so the pill never changes width.
          const hasHoverIcon = closable || pinned;
          return (
            <div
              key={tab.key}
              data-tab={tab.key}
              ref={active ? activeTabRef : undefined}
              // The app's pill is a single <button>; here it stays a div so the
              // close and port controls inside it remain real buttons.
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelectTab(i)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onSelectTab(i);
              }}
              onContextMenu={onContext}
              // Never shrinks below its label: a squeezed pill collapses onto
              // the close affordance, so selecting a tab would close it. The
              // strip scrolls instead, like the app's.
              className={`group flex h-6 max-w-[150px] shrink-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden rounded-md px-2 font-mono text-[11px] font-medium transition-colors duration-150 ${FOCUS_RING} ${
                active
                  ? "bg-[#3c3c3c] text-[#e5e5e5] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09),0_1px_2px_rgba(0,0,0,0.25)]"
                  : "text-[#9a9a9a] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e5e5e5]"
              }`}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className={`flex items-center justify-center transition-opacity ${
                    active ? "opacity-90" : "opacity-60 group-hover:opacity-80"
                  } ${hasHoverIcon ? "group-hover:hidden" : ""}`}
                >
                  {tab.type === "all" ? (
                    <Columns2 className="h-3.5 w-3.5" />
                  ) : tab.type === "service" ? (
                    <Zap
                      className={`h-3.5 w-3.5 ${tab.running ? "text-[#4ade80]" : ""}`}
                      strokeWidth={2}
                      fill={tab.running ? "currentColor" : "none"}
                    />
                  ) : tab.type === "browser" ? (
                    <Globe className="h-3.5 w-3.5" />
                  ) : tab.type === "review" ? (
                    <Code className="h-3.5 w-3.5" />
                  ) : tab.type === "files" ? (
                    <Folder className="h-3.5 w-3.5" />
                  ) : tab.emoji ? (
                    <span className="text-[12px] leading-none">{tab.emoji}</span>
                  ) : (
                    <TerminalIcon className="h-3.5 w-3.5" />
                  )}
                </span>
                {pinned ? (
                  <Tooltip
                    content="Pinned (right-click to unpin)"
                    side="bottom"
                    triggerClassName="hidden group-hover:inline-flex"
                  >
                    <Pin aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" />
                  </Tooltip>
                ) : closable ? (
                  <Tooltip
                    content="Close  ·  ⌘W"
                    side="bottom"
                    triggerClassName="hidden group-hover:inline-flex"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(i);
                      }}
                      aria-label={`Close ${tab.label}`}
                      className={`flex items-center rounded transition-colors hover:text-[#f87171] ${FOCUS_RING}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                ) : null}
              </span>
              <span
                className={`min-w-0 truncate ${
                  (tab.status && STATUS_LABEL_CLASS[tab.status]) || ""
                }`}
              >
                {tab.label}
              </span>
              {port !== undefined && (
                <Tooltip
                  content={`Preview localhost:${port}`}
                  side="bottom"
                  triggerClassName="inline-flex shrink-0"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPort(port);
                    }}
                    aria-label={`Preview localhost:${port} in a browser tab`}
                    className={`rounded font-mono text-[10px] tabular-nums opacity-60 transition-opacity hover:opacity-100 ${FOCUS_RING}`}
                  >
                    :{port}
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
        {onNewTab && <AddTabButton onAddTerminal={onNewTab} />}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {paneActions && paneActions.menu.length > 0 && (
          <PaneMenuButton
            actions={paneActions.menu}
            isDefault={paneActions.isDefault}
            onRun={(id) => paneActions.onRun(id, false)}
            onMove={(id) => paneActions.onMove(id, true)}
            onReset={paneActions.onReset}
          />
        )}
        {onSplitRight && (
          <Tooltip content="Split right  ·  ⌘D" side="bottom">
            <IconBtn onClick={onSplitRight} ariaLabel="Split right">
              <Columns2 />
            </IconBtn>
          </Tooltip>
        )}
        {onSplitDown && (
          <Tooltip content="Split down  ·  ⌘⇧D" side="bottom">
            <IconBtn onClick={onSplitDown} ariaLabel="Split down">
              <Rows2 />
            </IconBtn>
          </Tooltip>
        )}
        {paneActions?.toolbar.map((id) => (
          <PaneToolbarButton
            key={id}
            id={id}
            active={
              paneActions.activeTab !== null &&
              PANE_ACTION_META[id].tab === paneActions.activeTab
            }
            isDefault={paneActions.isDefault}
            onRun={() => paneActions.onRun(id, true)}
            onMove={() => paneActions.onMove(id, false)}
            onReset={paneActions.onReset}
          />
        ))}
        {onClear && (
          <Tooltip content="Clear  ·  ⌘K" side="bottom">
            <IconBtn onClick={onClear} ariaLabel="Clear">
              <Eraser />
            </IconBtn>
          </Tooltip>
        )}
        {onToggleFullscreen && (
          <Tooltip content={fullscreen ? "Exit fullscreen" : "Fullscreen"} side="bottom">
            <IconBtn
              onClick={onToggleFullscreen}
              ariaLabel={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </IconBtn>
          </Tooltip>
        )}
        {onClosePane && (
          <Tooltip content="Close pane" side="bottom">
            <IconBtn onClick={onClosePane} ariaLabel="Close pane">
              <X />
            </IconBtn>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
