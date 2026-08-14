"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { useStickToBottom } from "./use-stick-to-bottom";
import { History, Mic, Plus, Send, Sparkles, Square } from "lucide-react";
import type { ReplyContext } from "./projects";
import { FOCUS_RING } from "./ui";
import { AgentBanner, AgentStatusLine, TurnFooter, WorkingLine } from "./agent-chrome";
import { AgentTurn } from "./agent-turn";
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
  startedAt: number;
  doneMs: number;
  keepBusy?: boolean;
};

const MAX_HISTORY = 30;
// How long a seeded "still working" session runs before it lands.
const KEEP_ALIVE_MS = 5200;
const SETTLE_AFTER_MS = 32000;
// What a session that opens already finished claims it spent, so its footer
// reads like a turn that really ran instead of one that took no time at all.
const SEEDED_DONE_MS = 9000;

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
          startedAt: Date.now(),
          doneMs: 0,
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
        doneMs: Date.now() - x.startedAt,
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
          startedAt: Date.now() - SEEDED_DONE_MS,
          doneMs: SEEDED_DONE_MS,
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
      h.map((item) =>
        item.finished
          ? item
          : { ...item, finished: true, doneMs: Date.now() - item.startedAt },
      ),
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
  const project = cwd.slice(cwd.lastIndexOf("/") + 1);
  // Drives the status line's context/cost readouts, so they drift with the work
  // on screen instead of sitting at a constant.
  const work = history.reduce(
    (total, item) =>
      total +
      item.steps.slice(0, item.revealed).filter((s) => s.kind === "tool").length,
    0,
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#1a1a1a]">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100"
      >
        <div className="text-emerald-400">$ {b.cmd}</div>
        <div className="h-2" />
        <AgentBanner agent={agent} cwd={cwd} />
        <div className="h-2" />
        <div className="text-gray-500">
          <span className="font-semibold text-gray-400">
            {agent === "claude" ? "※ Tip:" : "Tip:"}
          </span>{" "}
          lpm launched {agent === "claude" ? "Claude" : "Codex"} in this
          project&apos;s root
        </div>

        <div className="h-3" />

        {history.map((item) => (
          <AgentTurn
            key={item.id}
            agent={agent}
            query={item.query}
            steps={item.steps}
            revealed={item.revealed}
            finished={item.finished}
            footer={
              !item.finished ? (
                <WorkingLine
                  agent={agent}
                  seed={item.id}
                  startedAt={item.startedAt}
                  tokens={tokensFor(item)}
                />
              ) : agent === "claude" ? (
                <TurnFooter
                  seed={item.id}
                  seconds={Math.max(1, Math.round(item.doneMs / 1000))}
                />
              ) : null
            }
          />
        ))}
      </div>
      <AgentStatusLine agent={agent} project={project} work={work} />
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
                className={`rounded-full border border-[#2e2e2e] bg-[#202020] px-2.5 py-1 text-[10px] transition-colors hover:bg-[#2a2a2a] ${b.color} ${FOCUS_RING}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="rounded-lg border border-[#2e2e2e] bg-[#202020] px-2.5 py-2 transition-colors focus-within:border-cyan-500">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                busy ? "Working… press Stop to interrupt" : `Send to ${b.name}…`
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

// Rough enough to read like the live counter Claude Code shows mid-turn: all it
// has to do is grow with the work already on screen.
function tokensFor(item: HistoryItem): number {
  return item.steps.slice(0, item.revealed).reduce((total, step) => {
    if (step.kind === "tool") return total + 340;
    if (step.kind === "text") return total + Math.ceil(step.text.length / 3);
    return total + 120;
  }, 280);
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
