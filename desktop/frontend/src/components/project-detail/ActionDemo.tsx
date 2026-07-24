import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RunMode } from "./actionInference";
import { TrafficLights } from "../ui/TrafficLights";

// Miniature app frame + animated run-mode demos backing the action wizard's
// live preview panel.

export type DemoState = RunMode | "confirm" | null;

export type FrameHighlight = "header" | "footer" | "content" | null;

const PREVIEW_TINT = "color-mix(in srgb, var(--accent-cyan) 16%, transparent)";
const PREVIEW_CONTENT_RING =
  "inset 0 0 0 1px color-mix(in srgb, var(--accent-cyan) 45%, transparent)";
const DEMO_OUTPUT_WIDTHS = ["72%", "48%", "62%"];

function useDemoScript(
  cmd: string,
  steps: number,
  onFinished?: () => void,
) {
  const [chars, setChars] = useState(0);
  const [step, setStep] = useState(0);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    setChars(0);
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const charMs = 28;
    const stepMs = 260;
    let typed = 0;
    const typeNext = () => {
      typed += 1;
      setChars(typed);
      if (typed < cmd.length) {
        timers.push(setTimeout(typeNext, charMs));
        return;
      }
      for (let s = 1; s <= steps; s += 1) {
        timers.push(
          setTimeout(() => {
            setStep(s);
            if (s === steps) finishedRef.current?.();
          }, s * stepMs),
        );
      }
      if (steps === 0) finishedRef.current?.();
    };
    timers.push(setTimeout(typeNext, charMs));
    return () => timers.forEach(clearTimeout);
  }, [cmd, steps]);

  return { typed: cmd.slice(0, chars), typingDone: chars >= cmd.length, step };
}

function MockModalShell({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  return (
    <>
      <div className="demo-dim absolute inset-0 bg-black/45" />
      <div
        className="demo-modal absolute left-1/2 top-1/2 overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg"
        style={{ width }}
      >
        {children}
      </div>
    </>
  );
}

function MockAppFrame({
  headerSlot,
  footerSlot,
  highlight = null,
  children,
}: {
  headerSlot: ReactNode;
  footerSlot?: ReactNode;
  highlight?: FrameHighlight;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full max-w-[240px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-md">
      <div className="flex h-[14px] items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2">
        <TrafficLights size="sm" />
      </div>

      <div className="flex h-[140px]">
        <div className="flex w-[36px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--bg-secondary)] p-1.5">
          <div className="h-1.5 rounded bg-[var(--border)]" />
          <div className="h-1.5 rounded bg-[var(--border)]" />
          <div className="h-1.5 w-2/3 rounded bg-[var(--border)] opacity-70" />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex h-[16px] items-center justify-end border-b border-[var(--border)] px-1.5 transition-colors duration-150"
            style={
              highlight === "header"
                ? { backgroundColor: PREVIEW_TINT }
                : undefined
            }
          >
            {headerSlot}
          </div>

          <div
            className="relative flex-1 overflow-hidden p-2 transition-shadow duration-150"
            style={
              highlight === "content"
                ? { boxShadow: PREVIEW_CONTENT_RING }
                : undefined
            }
          >
            {children}
          </div>

          {footerSlot && (
            <div
              className="flex h-[16px] items-center border-t border-[var(--border)] px-1.5 transition-colors duration-150"
              style={
                highlight === "footer"
                  ? { backgroundColor: PREVIEW_TINT }
                  : undefined
              }
            >
              {footerSlot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MockBodyLines() {
  return (
    <div className="space-y-1">
      <div className="h-[3px] w-3/4 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-1/2 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-2/3 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-1/3 rounded bg-[var(--border)] opacity-70" />
    </div>
  );
}

export function MockActionPlaceholder({
  display,
  highlight = null,
}: {
  display: "header" | "footer";
  highlight?: FrameHighlight;
}) {
  const slot = (
    <span
      key={display}
      className="demo-slot-in h-[9px] w-[34px] rounded-[3px] border border-dashed border-[var(--border)]"
    />
  );
  return (
    <MockAppFrame
      headerSlot={display === "header" ? slot : null}
      footerSlot={display === "footer" ? slot : undefined}
      highlight={highlight}
    >
      <MockBodyLines />
    </MockAppFrame>
  );
}

export function RunModeDemo({
  running,
  cmd,
  label,
  display,
  highlight,
  onTrigger,
  onConfirm,
  onCancel,
  onFinished,
}: {
  running: DemoState;
  cmd: string;
  label: string;
  display: "header" | "footer";
  highlight: FrameHighlight;
  onTrigger: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onFinished: () => void;
}) {
  const actionButton = (
    <button
      key={display}
      type="button"
      onClick={onTrigger}
      className="demo-slot-in max-w-[80px] truncate rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-[1px] text-[7px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
    >
      {label}
    </button>
  );
  return (
    <MockAppFrame
      headerSlot={display === "header" ? actionButton : null}
      footerSlot={display === "footer" ? actionButton : undefined}
      highlight={highlight}
    >
      <MockBodyLines />

      {running === "confirm" && (
        <MockModalShell width={140}>
          <div className="space-y-1 px-2 py-1.5">
            <div className="text-[8px] font-medium text-[var(--text-primary)]">
              Run {label}?
            </div>
            <div className="truncate font-mono text-[7px] text-[var(--text-muted)]">
              $ {cmd}
            </div>
          </div>
          <div className="flex justify-end gap-1 border-t border-[var(--border)] px-1.5 py-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-1.5 py-[1px] text-[7px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded bg-[var(--text-primary)] px-1.5 py-[1px] text-[7px] font-medium text-[var(--bg-primary)]"
            >
              Run
            </button>
          </div>
        </MockModalShell>
      )}

      {running === "once" && (
        <OnceDemo
          cmd={cmd}
          label={label}
          onCancel={onCancel}
          onFinished={onFinished}
        />
      )}

      {running === "terminal" && (
        <TerminalDemo prompt="$" cmd={cmd} onFinished={onFinished} />
      )}

      {running === "command" && (
        <TerminalDemo prompt="~ %" cmd={cmd} priorPrompt onFinished={onFinished} />
      )}

      {running === "background" && (
        <BackgroundDemo label={label} onFinished={onFinished} />
      )}
    </MockAppFrame>
  );
}

function TerminalDemo({
  prompt,
  cmd,
  priorPrompt = false,
  onFinished,
}: {
  prompt: string;
  cmd: string;
  priorPrompt?: boolean;
  onFinished: () => void;
}) {
  const { typed, typingDone, step } = useDemoScript(cmd, 3, onFinished);
  return (
    <div className="demo-terminal absolute inset-0 overflow-hidden bg-black p-1.5 font-mono text-[7px] leading-tight text-white/90">
      {priorPrompt && <div className="truncate text-white/40">{prompt}</div>}
      <div className="truncate">
        {prompt} {typed}
        {!typingDone && (
          <span className="demo-cursor ml-[1px] inline-block h-[6px] w-[3px] translate-y-[1px] bg-white/80" />
        )}
      </div>
      {typingDone && (
        <div className="mt-1 space-y-1">
          {DEMO_OUTPUT_WIDTHS.map((width, i) => (
            <div
              key={i}
              className="h-[3px] rounded bg-white/25 transition-opacity duration-200"
              style={{ width, opacity: step > i ? 1 : 0 }}
            />
          ))}
        </div>
      )}
      {step >= 3 && (
        <div className="mt-1 flex items-center gap-1 text-white/50">
          <span>{prompt}</span>
          <span className="demo-cursor inline-block h-[6px] w-[3px] bg-white/80" />
        </div>
      )}
    </div>
  );
}

function OnceDemo({
  cmd,
  label,
  onCancel,
  onFinished,
}: {
  cmd: string;
  label: string;
  onCancel: () => void;
  onFinished: () => void;
}) {
  const { typed, typingDone, step } = useDemoScript(cmd, 2, onFinished);
  return (
    <MockModalShell width={124}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-1.5 py-1">
        <span className="truncate text-[7px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded text-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ×
        </button>
      </div>
      <div className="space-y-0.5 px-1.5 py-1 font-mono text-[6px] leading-tight">
        <div className="truncate text-[var(--text-primary)]">
          $ {typed}
          {!typingDone && (
            <span className="demo-cursor ml-[1px] inline-block h-[5px] w-[2px] translate-y-[1px] bg-[var(--text-primary)]" />
          )}
        </div>
        {step >= 1 && <div className="text-[var(--text-muted)]">output…</div>}
        {step >= 2 && <div className="text-[var(--text-muted)]">✓ Done</div>}
      </div>
    </MockModalShell>
  );
}

function BackgroundDemo({
  label,
  onFinished,
}: {
  label: string;
  onFinished: () => void;
}) {
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    const timer = setTimeout(() => finishedRef.current(), 1200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="demo-toast absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 shadow">
      <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--text-secondary)]" />
      <span className="max-w-[90px] truncate text-[7px] text-[var(--text-secondary)]">
        {label} running…
      </span>
    </div>
  );
}
