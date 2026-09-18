"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LineColor, OutputLine } from "./projects";
import { useStickToBottom } from "./use-stick-to-bottom";
import { Tooltip } from "./tooltip";
import { useDemoActive } from "./demo-active";
import { FOCUS_RING } from "./ui";

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
  const active = useDemoActive();

  // The boot lines play once. Keeping them out of the pause below matters: a
  // paused-and-resumed effect would schedule the whole banner a second time.
  useEffect(() => {
    const timers = output.map((line) =>
      window.setTimeout(() => setLines((prev) => [...prev, line]), line.delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [output]);

  // The tail keeps appending forever, so it only runs while someone is looking.
  const loopStartedRef = useRef(false);
  useEffect(() => {
    if (!loop || !active) return;
    const lastDelay = output.length ? output[output.length - 1].delay : 0;
    // The lead-in only spaces the tail after the boot lines. Coming back from a
    // pause it has already been served, so the log picks up straight away.
    const wait = loopStartedRef.current ? 0 : lastDelay + LOOP_START_DELAY_MS;
    let loopId: number | undefined;
    const startId = window.setTimeout(() => {
      loopStartedRef.current = true;
      loopId = window.setInterval(() => {
        setLines((prev) => {
          const next = [...prev, loop.line];
          if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES);
          return next;
        });
      }, loop.intervalMs);
    }, wait);
    return () => {
      window.clearTimeout(startId);
      if (loopId !== undefined) window.clearInterval(loopId);
    };
  }, [output, loop, active]);


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
