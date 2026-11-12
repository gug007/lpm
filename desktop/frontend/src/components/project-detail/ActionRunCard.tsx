import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, CircleAlert, CircleStop, Copy, Loader2, RotateCcw, Square, X } from "lucide-react";
import { AnsiLine } from "../AnsiLine";
import { failureText } from "../backgroundRunToastText";
import { useSecondsClock } from "../../hooks/useSecondsClock";
import type { ActionRunCapture } from "../../hooks/actionRunCapture";
import { FixWithAgentButton } from "../FixWithAgentButton";
import { actionFailurePrompt } from "./actionFailurePrompt";
import {
  RUN_CARD_AUTO_CLOSE_MS,
  RUN_CARD_WIDTH,
  findRunAnchor,
  placeRunCard,
  runDuration,
  runState,
  type RunCardPlacement,
} from "./runCardPlacement";

interface ActionRunCardProps {
  label: string;
  // The data-action-run of the button that started the run, which the card
  // opens next to.
  runKey?: string;
  // Where the card opens instead, for a run no button started.
  place?: (view: { width: number; height: number }) => RunCardPlacement;
  run: ActionRunCapture;
  startedAt: number;
  onClose: () => void;
  onRunAgain: () => void;
  // Offered while the run is going, for one that may not end by itself.
  onStop?: () => void;
  // More output on screen at a size easier to read, for a wide card.
  large?: boolean;
  // Where a failed run can be handed to an agent, and the command it ran.
  fix?: { projectName: string; cmd?: string };
}

const SMALL_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40";

// A quick action's output, next to its button and out of the way of the rest
// of the app. A pass closes itself unless the pointer is on it; a failure
// stays until it's closed.
export function ActionRunCard({
  label,
  runKey = "",
  place: placeAt,
  run,
  startedAt,
  onClose,
  onRunAgain,
  onStop,
  large = false,
  fix,
}: ActionRunCardProps) {
  const { lines, done, dropped, endedAt } = useSyncExternalStore(run.subscribe, run.snapshot);
  const now = useSecondsClock(done !== null);
  const [place, setPlace] = useState<RunCardPlacement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const drainRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const placeAtRef = useRef(placeAt);
  useLayoutEffect(() => {
    const update = () => {
      const view = { width: window.innerWidth, height: window.innerHeight };
      setPlace(placeAtRef.current ? placeAtRef.current(view) : placeRunCard(findRunAnchor(runKey), view));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [runKey]);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, expanded]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const autoClose = done?.success === true && !hovered && !expanded;
  useEffect(() => {
    if (!autoClose) return;
    const bar = drainRef.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: RUN_CARD_AUTO_CLOSE_MS,
      easing: "linear",
      fill: "forwards",
    });
    const t = setTimeout(() => closeRef.current(), RUN_CARD_AUTO_CLOSE_MS);
    return () => {
      clearTimeout(t);
      bar?.cancel();
    };
  }, [autoClose]);

  // Kept across the clock's ticks and hovers, which would otherwise redraw
  // every line each second.
  const output = useMemo(
    () =>
      lines.map((line, i) => (
        <div key={(dropped ?? 0) + i} className="whitespace-pre-wrap break-all">
          {line ? <AnsiLine text={line} /> : " "}
        </div>
      )),
    [lines, dropped],
  );

  const copyOutput = () => {
    void navigator.clipboard.writeText(lines.join("\n")).then(() => setCopied(true));
  };

  const state = runState(done);
  const took = runDuration((done ? (endedAt ?? now) : now) - startedAt);
  const status = {
    running: `Running · ${took}`,
    passed: `Finished in ${took}`,
    stopped: `Stopped after ${took}`,
    failed: `Failed after ${took}`,
  }[state];

  return (
    <div
      data-action-run-card
      data-run-state={state}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: RUN_CARD_WIDTH, ...place, visibility: place ? "visible" : "hidden" }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {state === "running" ? (
            <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
          ) : state === "passed" ? (
            <Check size={14} strokeWidth={2.5} className="text-[var(--accent-green)]" />
          ) : state === "stopped" ? (
            <CircleStop size={14} className="text-[var(--text-muted)]" />
          ) : (
            <CircleAlert size={14} className="text-[var(--accent-red)]" />
          )}
        </span>
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--text-muted)]">{status}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={13} />
        </button>
      </div>
      {state === "failed" && done?.error && (
        <div className="break-words px-3 pb-2 text-[11px] leading-snug text-[var(--accent-red)]">
          {failureText(done.error, lines.length > 0)}
        </div>
      )}
      <div
        ref={outputRef}
        className={`mx-3 select-text overflow-y-auto rounded-lg bg-[var(--terminal-bg)] px-2.5 py-2 font-mono leading-relaxed text-[var(--terminal-fg)] ${
          large ? "text-[12px]" : "text-[10.5px]"
        } ${expanded ? (large ? "max-h-[70vh]" : "max-h-[50vh]") : large ? "max-h-80" : "max-h-36"}`}
      >
        {dropped ? (
          <div className="text-[var(--text-muted)]">{dropped.toLocaleString()} earlier lines not shown</div>
        ) : null}
        {lines.length === 0 ? (
          <span className="text-[var(--text-muted)]">{state === "running" ? "Waiting for output…" : "No output"}</span>
        ) : (
          output
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-2">
        {fix && state === "failed" && (
          <FixWithAgentButton
            projectName={fix.projectName}
            prompt={() => actionFailurePrompt({ label, cmd: fix.cmd, error: done?.error, lines })}
            description="Opens a new tab with this run's output"
            align="start"
            className={SMALL_BUTTON}
          />
        )}
        {onStop && state === "running" ? (
          <button type="button" onClick={onStop} className={SMALL_BUTTON}>
            <Square size={11} />
            Stop
          </button>
        ) : (
          <button type="button" onClick={onRunAgain} disabled={state === "running"} className={SMALL_BUTTON}>
            <RotateCcw size={12} />
            Run again
          </button>
        )}
        <button type="button" onClick={copyOutput} disabled={lines.length === 0} className={SMALL_BUTTON}>
          {copied ? <Check size={12} className="text-[var(--accent-green)]" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy output"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {state === "passed" && (
        <div className="h-0.5 bg-[var(--border)]">
          <div
            ref={drainRef}
            className={`h-full origin-left bg-[var(--accent-green)] ${autoClose ? "" : "opacity-0"}`}
          />
        </div>
      )}
    </div>
  );
}
