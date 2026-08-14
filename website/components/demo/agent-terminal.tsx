"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { useStickToBottom } from "./use-stick-to-bottom";
import { History, Mic, Plus, Send, Sparkles, Square } from "lucide-react";
import type { ReplyContext } from "./projects";
import { FOCUS_RING, useReducedMotion } from "./ui";
import {
  BRAND,
  DONE_STEPS,
  GENERIC_REPLY_CONTEXT,
  IN_PROGRESS_STEPS,
  SUGGESTIONS,
  buildReply,
  keepAliveSteps,
  settleStep,
  stepDelay,
  type AgentKind,
  type AgentStep as Step,
  type ReplyIntent,
} from "./agent-script";

export type AgentStatus = "running" | "done";

type HistoryItem = {
  id: number;
  query: string;
  revealed: number;
  steps: Step[];
  finished: boolean;
  keepBusy?: boolean;
};

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_HISTORY = 30;
// How long a seeded "still working" session runs before it lands.
const KEEP_ALIVE_MS = 5200;
const SETTLE_AFTER_MS = 32000;

// Its own component so the 80ms tick re-renders one span, not the whole
// transcript — every mounted project has a session that may be spinning.
function Spinner() {
  const [i, setI] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(
      () => setI((v) => (v + 1) % SPINNER.length),
      80,
    );
    return () => window.clearInterval(id);
  }, [reducedMotion]);
  return <>{reducedMotion ? SPINNER[0] : SPINNER[i]}</>;
}

type AgentTerminalProps = {
  agent: AgentKind;
  cwd: string;
  replyContext?: ReplyContext;
  onStatus?: (status: AgentStatus) => void;
  // When set, the session opens with this prompt already sent. autoMode
  // "progress" streams a canned reply that never resolves (agent still
  // working); "done" shows the reply already finished (work already complete).
  autoPrompt?: string;
  autoMode?: "progress" | "done";
  autoSteps?: Step[];
};

export function AgentTerminal({
  agent,
  cwd,
  replyContext,
  onStatus,
  autoPrompt,
  autoMode = "progress",
  autoSteps,
}: AgentTerminalProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([
    history,
    busy,
  ]);
  const nextIdRef = useRef(0);
  const pendingRef = useRef<ReplyIntent | undefined>(undefined);
  const keepAliveIdxRef = useRef(0);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  const ctx = replyContext ?? GENERIC_REPLY_CONTEXT;

  const runQuery = (
    text: string,
    opts?: { steps?: Step[]; keepBusy?: boolean },
  ) => {
    let steps = opts?.steps;
    if (!steps) {
      const reply = buildReply(text, agent, ctx, pendingRef.current);
      steps = reply.steps;
      pendingRef.current = reply.intent;
    }
    if (steps.length === 0) return;
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setHistory((h) => {
      const next = [
        ...h,
        {
          id,
          query: text,
          revealed: 0,
          steps,
          finished: false,
          keepBusy: opts?.keepBusy,
        },
      ];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setBusy(true);
    onStatusRef.current?.("running");
  };

  // One pending timer at a time, re-derived from the transcript: closing the
  // tab or interrupting cancels the reveal instead of leaving timers to report
  // a status for a turn that is already over.
  useEffect(() => {
    const item = history[history.length - 1];
    if (!item || item.finished) return;

    const patch = (fn: (x: HistoryItem) => HistoryItem) =>
      setHistory((h) => h.map((x) => (x.id === item.id ? fn(x) : x)));

    const finish = (closing?: Step) => {
      patch((x) => ({
        ...x,
        finished: true,
        keepBusy: false,
        steps: closing ? [...x.steps, closing] : x.steps,
        revealed: x.steps.length + (closing ? 1 : 0),
      }));
      setBusy(false);
      onStatusRef.current?.("done");
    };

    const after = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    };

    if (item.revealed < item.steps.length) {
      return after(stepDelay(item.steps[item.revealed]), () =>
        patch((x) => ({ ...x, revealed: x.revealed + 1 })),
      );
    }

    if (!item.keepBusy) return after(220, () => finish());

    // A seeded session keeps working rather than freezing on one spinner:
    // more steps trickle in, then it lands so the sidebar badge can flip.
    const alive = keepAliveSteps(ctx);
    const extra = keepAliveIdxRef.current;
    if (extra >= alive.length) {
      return after(SETTLE_AFTER_MS, () => finish(settleStep(ctx)));
    }
    return after(KEEP_ALIVE_MS, () => {
      keepAliveIdxRef.current = extra + 1;
      patch((x) => ({
        ...x,
        steps: [...x.steps, alive[extra]],
        revealed: x.steps.length,
      }));
    });
  }, [history, ctx]);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // The agent launches idle, awaiting your first prompt — unless it opens
    // with work in flight (progress) or already finished (done) via autoPrompt.
    if (autoPrompt && autoMode === "progress") {
      runQuery(autoPrompt, {
        steps: autoSteps ?? IN_PROGRESS_STEPS,
        keepBusy: true,
      });
    } else if (autoPrompt && autoMode === "done") {
      nextIdRef.current += 1;
      setHistory([
        {
          id: nextIdRef.current,
          query: autoPrompt,
          revealed: DONE_STEPS.length,
          steps: DONE_STEPS,
          finished: true,
        },
      ]);
      // Without this the finished session never reports itself, so its sidebar
      // badge disappears for good the first time the project is opened.
      onStatusRef.current?.("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors the app's interrupt: the turn in flight settles where it stands
  // and the composer is free again.
  const stop = () => {
    setHistory((h) =>
      h.map((item) => (item.finished ? item : { ...item, finished: true })),
    );
    setBusy(false);
    onStatusRef.current?.("done");
    inputRef.current?.focus();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (busy) stop();
    setInput("");
    runQuery(text);
  };

  const lastQuery = history.length ? history[history.length - 1].query : "";

  const fillInput = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const b = BRAND[agent];
  const brand = b.glyph;
  const brandColor = b.color;
  const promptGlyph = b.prompt;
  const toolBullet = b.bullet;
  const welcomeTitle = b.title;
  const welcomeHelp = b.help;
  const agentName = b.name;

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#1a1a1a]">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100"
      >
      <div className="text-emerald-400">$ {agent}</div>
      <div className="h-2" />
      <div className={brandColor}>
        <span className="mr-2">{brand}</span>
        {welcomeTitle}
      </div>
      <div className="h-1" />
      <div className="pl-4 text-gray-400">{welcomeHelp}</div>
      <div className="pl-4 text-gray-400">cwd: {cwd}</div>
      <div className="h-1" />
      <div className="pl-2 text-gray-600">────────────────────</div>
      <div className="h-1" />
      <div className="pl-2 text-gray-400">
        ※ Tip: lpm launched {agent === "claude" ? "Claude" : "Codex"}{" "}
        in this project&apos;s root
      </div>

      <div className="h-3" />

      {history.map((item) => (
        <div key={item.id} className="mb-3">
          <div className="flex gap-2">
            <span className={brandColor}>{promptGlyph}</span>
            <span className="text-gray-100 whitespace-pre-wrap break-words">
              {item.query}
            </span>
          </div>
          <div className="mt-1 pl-4 space-y-1">
            {item.steps.slice(0, item.revealed).map((step, i) => {
              if (step.kind === "thinking") {
                const active = !item.finished && i === item.revealed - 1;
                return (
                  <div key={i} className={brandColor}>
                    <span className="inline-block w-3 tabular-nums">
                      {active ? <Spinner /> : "✓"}
                    </span>
                    <span className="ml-1">Thinking…</span>
                  </div>
                );
              }
              if (step.kind === "tool") {
                return (
                  <div key={i}>
                    <div>
                      <span className={brandColor}>{toolBullet}</span>
                      <span className="ml-1.5 text-gray-200">{step.label}</span>
                      <span className="text-gray-500">({step.arg})</span>
                    </div>
                    <div className="pl-5 text-gray-500">⎿ {step.result}</div>
                  </div>
                );
              }
              const className =
                step.style === "muted"
                  ? "text-gray-500"
                  : "text-gray-100";
              return (
                <div
                  key={i}
                  className={`${className} whitespace-pre-wrap break-words`}
                >
                  {step.text || " "}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      </div>
      <div className="shrink-0 border-t border-[#2e2e2e] px-3 py-2">
        {history.length === 0 && !busy && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setInput("");
                  runQuery(suggestion);
                }}
                className={`rounded-full border border-[#2e2e2e] bg-[#202020] px-2.5 py-1 text-[10px] transition-colors hover:bg-[#2a2a2a] ${brandColor} ${FOCUS_RING}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="rounded-lg border border-[#2e2e2e] bg-[#202020] px-2.5 py-2 transition-colors focus-within:border-[#3a3a3a]">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                busy ? "Working… press Stop to interrupt" : `Send to ${agentName}…`
              }
              {...NO_AUTOFILL}
              className="w-full bg-transparent text-[12px] text-gray-100 outline-none placeholder:text-gray-600 caret-gray-100"
            />
            <div className="mt-1.5 flex items-center justify-end gap-0.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600"
              >
                <Mic className="h-3.5 w-3.5" />
              </span>
              <ComposerIcon
                title="Suggest a prompt"
                onClick={() => fillInput(SUGGESTIONS[0])}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </ComposerIcon>
              <ComposerIcon
                title="New input"
                onClick={() => inputRef.current?.focus()}
              >
                <Plus className="h-4 w-4" />
              </ComposerIcon>
              <ComposerIcon
                title="Message history"
                disabled={!lastQuery}
                onClick={() => fillInput(lastQuery)}
              >
                <History className="h-3.5 w-3.5" />
              </ComposerIcon>
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop"
                  title="Stop"
                  className={`ml-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-[#f87171] text-[#1a1a1a] transition-opacity hover:opacity-85 ${FOCUS_RING}`}
                >
                  <Square className="h-3 w-3" fill="currentColor" strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  title="Send"
                  className={`ml-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-[#60a5fa] text-[#1a1a1a] transition-opacity hover:opacity-85 disabled:opacity-40 ${FOCUS_RING}`}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ComposerIcon({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200 disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
