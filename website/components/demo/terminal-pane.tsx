"use client";

import { useEffect, useRef, useState } from "react";
import {
  Columns2,
  Plus,
  Rows2,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import type { LineColor, OutputLine } from "./projects";

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
  type: "service" | "terminal";
  port?: number;
  running: boolean;
};

type PaneHeaderProps = {
  tabs: TabInfo[];
  activeIdx: number;
  onSelectTab: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onNewTab?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
};

export function PaneHeader({
  tabs,
  activeIdx,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onSplitRight,
  onSplitDown,
}: PaneHeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 bg-[#2d2d2d] px-1.5 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          return (
            <div
              key={tab.key}
              onClick={() => onSelectTab(i)}
              className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 cursor-pointer transition-colors ${
                active
                  ? "bg-white/[0.1] text-[#d4d4d4]"
                  : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#d4d4d4]"
              }`}
            >
              {tab.type === "service" ? (
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    tab.running
                      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                      : "bg-gray-600"
                  }`}
                />
              ) : (
                <TerminalIcon className="w-3 h-3 text-[#8e8e8e] shrink-0" />
              )}
              <span className="font-mono text-[11px] font-medium truncate">
                {tab.label}
              </span>
              {tab.port !== undefined && (
                <span className="font-mono text-[10px] text-[#8e8e8e] tabular-nums shrink-0">
                  :{tab.port}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(i);
                }}
                aria-label={`Close ${tab.label}`}
                className="rounded text-[#8e8e8e] hover:text-gray-100 transition-colors shrink-0 leading-none"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {onNewTab && (
          <button
            type="button"
            onClick={onNewTab}
            aria-label="New terminal"
            title="New terminal"
            className="rounded-md px-1.5 py-0.5 text-[#8e8e8e] hover:bg-white/[0.08] hover:text-gray-100 transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      {onSplitRight && (
        <button
          type="button"
          onClick={onSplitRight}
          aria-label="Split right"
          title="Split right"
          className="rounded-md px-1.5 py-0.5 text-[#8e8e8e] hover:bg-white/[0.08] hover:text-gray-100 transition-colors shrink-0"
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
          className="rounded-md px-1.5 py-0.5 text-[#8e8e8e] hover:bg-white/[0.08] hover:text-gray-100 transition-colors shrink-0"
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
