"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Columns2,
  Globe,
  Pin,
  Rows2,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import type { LineColor, OutputLine } from "./projects";
import { AddTabSplitButton } from "./tab-controls";

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
  type: "service" | "terminal" | "browser";
  port?: number;
  running: boolean;
  emoji?: string;
  pinned?: boolean;
};

type PaneHeaderProps = {
  tabs: TabInfo[];
  activeIdx: number;
  onSelectTab: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onNewTab?: () => void;
  onNewBrowser?: () => void;
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
  onSplitRight,
  onSplitDown,
  onTabContextMenu,
}: PaneHeaderProps) {
  return (
    <div role="tablist" className="flex-shrink-0 flex items-center gap-0.5 bg-[#2d2d2d] px-1.5 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          const canContext = tab.type !== "service";
          const onContext = (e: MouseEvent) => {
            if (!canContext || !onTabContextMenu) return;
            e.preventDefault();
            onTabContextMenu(i, e.clientX, e.clientY);
          };
          return (
            <div
              key={tab.key}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => onSelectTab(i)}
              onContextMenu={onContext}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(i);
                }
              }}
              className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                active
                  ? "bg-white/[0.1] text-[#d4d4d4]"
                  : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#d4d4d4]"
              }`}
            >
              <span aria-hidden="true" className="flex w-3.5 shrink-0 items-center justify-center">
                {tab.type === "service" ? (
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      tab.running
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                        : "bg-gray-600"
                    }`}
                  />
                ) : tab.type === "browser" ? (
                  <Globe className="w-3.5 h-3.5 text-[#8e8e8e]" />
                ) : tab.emoji ? (
                  <span className="text-[12px] leading-none">{tab.emoji}</span>
                ) : (
                  <TerminalIcon className="w-3 h-3 text-[#8e8e8e]" />
                )}
              </span>
              <span className="font-mono text-[11px] font-medium truncate">
                {tab.label}
              </span>
              {tab.port !== undefined && (
                <span className="font-mono text-[10px] text-[#8e8e8e] tabular-nums shrink-0">
                  :{tab.port}
                </span>
              )}
              {tab.pinned ? (
                <Pin
                  aria-hidden="true"
                  className="w-3 h-3 text-[#8e8e8e] shrink-0"
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
                  className="rounded text-[#8e8e8e] hover:text-gray-100 transition-colors shrink-0 leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        {onNewTab && (
          <AddTabSplitButton
            onAddTerminal={onNewTab}
            onAddBrowser={onNewBrowser ?? onNewTab}
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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={scrollRef}
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
