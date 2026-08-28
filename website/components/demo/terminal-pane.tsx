"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  ChevronRight,
  Code,
  Columns2,
  Eraser,
  Globe,
  Pin,
  Rows2,
  Terminal as TerminalIcon,
  X,
  Zap,
} from "lucide-react";
import type { LineColor, OutputLine } from "./projects";
import type { AgentStatus } from "./agent-terminal";
import { useStickToBottom } from "./use-stick-to-bottom";
import { AddTabSplitButton } from "./tab-controls";
import { IconBtn } from "./icon-btn";
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

const MAX_LINES = 140;
const LOOP_START_DELAY_MS = 800;

// The bright half of the xterm palette the app ships (terminal-colors.ts), on
// the app's #cccccc default foreground.
const COLOR_CLASS: Record<LineColor, string> = {
  default: "text-[#cccccc]",
  muted: "text-[#8e8e8e]",
  green: "text-[#5ffa68]",
  cyan: "text-[#60fdff]",
  yellow: "text-[#fffc67]",
  red: "text-[#ff6e67]",
  magenta: "text-[#ff77ff]",
};

export type TabInfo = {
  key: string;
  label: string;
  type: "all" | "service" | "terminal" | "browser" | "review";
  port?: number;
  running: boolean;
  emoji?: string;
  pinned?: boolean;
  status?: AgentStatus;
  closable?: boolean;
};

type PaneHeaderProps = {
  tabs: TabInfo[];
  activeIdx: number;
  focused?: boolean;
  onSelectTab: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onNewTab?: () => void;
  onNewBrowser?: () => void;
  onNewReview?: () => void;
  onOpenPort: (port: number) => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onClear?: () => void;
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
  onNewBrowser,
  onNewReview,
  onOpenPort,
  onSplitRight,
  onSplitDown,
  onClear,
  onClosePane,
  onTabContextMenu,
}: PaneHeaderProps) {
  // Only a split tree has a pane worth singling out, so the cyan focus edge
  // rides on the close control the split also brings.
  const canClose = !!onClosePane;
  return (
    <div
      className={`flex-shrink-0 flex items-center gap-0.5 border-b bg-[#2d2d2d] px-2 py-1 ${
        focused && canClose
          ? "border-b-[#22d3ee]"
          : "border-b-[rgba(255,255,255,0.06)]"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
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
          // rather than sitting beside it, so the pill never changes width.
          const hasHoverIcon = closable || pinned;
          return (
            <div
              key={tab.key}
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
              className={`group flex h-6 max-w-[150px] min-w-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden rounded-md px-2 font-mono text-[11px] font-medium transition-colors duration-150 ${FOCUS_RING} ${
                active
                  ? "bg-[#3c3c3c] text-[#e5e5e5] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09),0_1px_2px_rgba(0,0,0,0.25)]"
                  : "text-[#8e8e8e] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e5e5e5]"
              }`}
            >
              <span className="flex shrink-0 items-center">
                <span
                  aria-hidden="true"
                  className={`flex items-center transition-opacity ${
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
        {onNewTab && (
          <AddTabSplitButton
            onAddTerminal={onNewTab}
            onAddBrowser={onNewBrowser ?? onNewTab}
            onAddReview={onNewReview ?? onNewTab}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
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
        {onClear && (
          <Tooltip content="Clear  ·  ⌘K" side="bottom">
            <IconBtn onClick={onClear} ariaLabel="Clear">
              <Eraser />
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

// Names a log column in the tiled "All" view, and doubles as the way into that
// service's own tab.
export function ServiceLabelBar({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[rgba(255,255,255,0.06)] bg-[#2d2d2d] px-3 py-0.5 font-mono text-[10px] font-medium text-[#8e8e8e]">
      <Tooltip
        content={`Open ${label} tab`}
        side="bottom"
        triggerClassName="flex min-w-0 flex-1"
      >
        <button
          type="button"
          onClick={onClick}
          className={`group -ml-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left transition-colors hover:text-[#e5e5e5] ${FOCUS_RING}`}
        >
          <span className="truncate">{label}</span>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
        </button>
      </Tooltip>
    </div>
  );
}

type StreamingOutputProps = {
  output: OutputLine[];
  loop?: { line: OutputLine; intervalMs: number };
};

export function StreamingOutput({ output, loop }: StreamingOutputProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([lines]);

  useEffect(() => {
    const timers: number[] = [];
    output.forEach((line) => {
      const id = window.setTimeout(() => {
        setLines((prev) => [...prev, line]);
      }, line.delay);
      timers.push(id);
    });

    let loopId: number | undefined;
    if (loop) {
      const lastDelay = output.length ? output[output.length - 1].delay : 0;
      const startId = window.setTimeout(() => {
        loopId = window.setInterval(() => {
          setLines((prev) => {
            const next = [...prev, loop.line];
            if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES);
            return next;
          });
        }, loop.intervalMs);
      }, lastDelay + LOOP_START_DELAY_MS);
      timers.push(startId);
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (loopId !== undefined) window.clearInterval(loopId);
    };
  }, [output, loop]);


  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.3] bg-[#1a1a1a]"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={`${COLOR_CLASS[line.color ?? "default"]} whitespace-pre-wrap break-all`}
        >
          {line.text || " "}
        </div>
      ))}
      <div className="flex items-center text-[#cccccc]">
        <span className="mr-1 text-[#8e8e8e]">&gt;</span>
        <span className="inline-block h-3.5 w-[7px] animate-pulse bg-[#cccccc]" />
      </div>
    </div>
  );
}
