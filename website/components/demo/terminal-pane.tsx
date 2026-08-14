"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  Code,
  Columns2,
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
import { FOCUS_RING } from "./ui";


const STATUS_LABEL_CLASS: Record<AgentStatus, string> = {
  running: "sidebar-shimmer",
  done: "text-[#60a5fa]",
};

const MAX_LINES = 140;
const LOOP_START_DELAY_MS = 800;

const COLOR_CLASS: Record<LineColor, string> = {
  default: "text-gray-100",
  muted: "text-gray-400",
  green: "text-emerald-400",
  cyan: "text-cyan-300",
  yellow: "text-amber-300",
  red: "text-red-400",
  magenta: "text-fuchsia-300",
};

export type TabInfo = {
  key: string;
  label: string;
  type: "service" | "terminal" | "browser" | "review";
  port?: number;
  running: boolean;
  emoji?: string;
  pinned?: boolean;
  status?: AgentStatus;
};

type PaneHeaderProps = {
  tabs: TabInfo[];
  activeIdx: number;
  onSelectTab: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onNewTab?: () => void;
  onNewBrowser?: () => void;
  onNewReview?: () => void;
  onOpenPort: (port: number) => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onTabContextMenu?: (idx: number, x: number, y: number) => void;
};

export function PaneHeader({
  tabs,
  activeIdx,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewBrowser,
  onNewReview,
  onOpenPort,
  onSplitRight,
  onSplitDown,
  onTabContextMenu,
}: PaneHeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 bg-[#2d2d2d] px-1.5 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          const port = tab.port;
          const canContext = tab.type !== "service";
          const onContext = (e: MouseEvent) => {
            if (!canContext || !onTabContextMenu) return;
            e.preventDefault();
            onTabContextMenu(i, e.clientX, e.clientY);
          };
          // The close control is revealed on hover, and on the active tab so it
          // stays reachable without a pointer that can hover (touch).
          const revealFlex = active ? "flex" : "hidden group-hover:flex";
          const revealBlock = active ? "block" : "hidden group-hover:block";
          return (
            <div
              key={tab.key}
              onClick={() => onSelectTab(i)}
              onContextMenu={onContext}
              className={`group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors ${
                active
                  ? "bg-white/[0.1] text-[#d4d4d4]"
                  : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#d4d4d4]"
              }`}
            >
              <span className="flex shrink-0 items-center justify-center gap-1">
                <span
                  aria-hidden="true"
                  className={`items-center justify-center ${
                    active ? "flex" : "flex group-hover:hidden"
                  }`}
                >
                  {tab.type === "service" ? (
                    <Zap
                      className={`w-3 h-3 ${tab.running ? "text-emerald-400" : "text-[#8e8e8e]"}`}
                      strokeWidth={2}
                      fill={tab.running ? "currentColor" : "none"}
                    />
                  ) : tab.type === "browser" ? (
                    <Globe className="w-3.5 h-3.5 text-[#8e8e8e]" />
                  ) : tab.type === "review" ? (
                    <Code className="w-3 h-3 text-[#8e8e8e]" />
                  ) : tab.emoji ? (
                    <span className="text-[12px] leading-none">{tab.emoji}</span>
                  ) : (
                    <TerminalIcon className="w-3 h-3 text-[#8e8e8e]" />
                  )}
                </span>
                {tab.pinned ? (
                  <Pin
                    aria-hidden="true"
                    className={`w-3 h-3 text-[#8e8e8e] ${revealBlock}`}
                    fill="currentColor"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(i);
                    }}
                    aria-label={`Close ${tab.label}`}
                    title="Close (⌘W)"
                    className={`items-center justify-center rounded text-[#8e8e8e] transition-colors hover:text-gray-100 ${revealFlex} ${FOCUS_RING}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                className={`flex min-w-0 items-center gap-1.5 rounded-sm text-left ${FOCUS_RING}`}
              >
                <span
                  className={`font-mono text-[11px] font-medium truncate ${
                    tab.status ? STATUS_LABEL_CLASS[tab.status] : ""
                  }`}
                >
                  {tab.label}
                </span>
              </button>
              {port !== undefined && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPort(port);
                  }}
                  title={`Preview localhost:${port} in a browser tab`}
                  className={`shrink-0 rounded font-mono text-[10px] tabular-nums text-[#8e8e8e] transition-colors hover:text-cyan-300 ${FOCUS_RING}`}
                >
                  :{port}
                </button>
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
      {onSplitRight && (
        <button
          type="button"
          onClick={onSplitRight}
          aria-label="Split right"
          title="Split right"
          className="hidden sm:inline-flex rounded-md px-1.5 py-0.5 text-[#8e8e8e] hover:bg-white/[0.08] hover:text-gray-100 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          <Columns2 className="w-3 h-3" />
        </button>
      )}
      {onSplitDown && (
        <button
          type="button"
          onClick={onSplitDown}
          aria-label="Split down"
          title="Split down"
          className="hidden sm:inline-flex rounded-md px-1.5 py-0.5 text-[#8e8e8e] hover:bg-white/[0.08] hover:text-gray-100 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          <Rows2 className="w-3 h-3" />
        </button>
      )}
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
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-[#1a1a1a]"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={`${COLOR_CLASS[line.color ?? "default"]} whitespace-pre-wrap break-all`}
        >
          {line.text || " "}
        </div>
      ))}
      <div className="flex items-center text-gray-100">
        <span className="text-gray-500 mr-1">&gt;</span>
        <span className="inline-block w-[7px] h-3.5 bg-gray-100 animate-pulse" />
      </div>
    </div>
  );
}
