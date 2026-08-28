"use client";

import { useEffect, useRef, useState } from "react";
import { useStickToBottom } from "./use-stick-to-bottom";
import type { ReplyContext } from "./projects";
import { FOCUS_RING, PRESS } from "./ui";
import { AgentBanner, AgentStatusLine, TurnFooter, WorkingLine } from "./agent-chrome";
import { AgentComposer } from "./agent-composer";
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

export type AgentStatus = "running" | "waiting" | "done" | "error";

type HistoryItem = {
  id: number;
  query: string;
  revealed: number;
  steps: Step[];
  finished: boolean;
  startedAt: number;
  doneMs: number;
  keepBusy?: boolean;
  // The reply ends on a question, so the landed turn is waiting on you rather
  // than done with you.
  asks?: boolean;
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
    let asks = false;
    if (!steps) {
      const reply = buildReply(text, agent, ctx, pendingRef.current);
      steps = reply.steps;
      asks = reply.intent !== undefined;
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
          asks,
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
      onStatusRef.current?.(item.asks ? "waiting" : "done");
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
          : {
              ...item,
              finished: true,
              // Cut off before the question landed, so nothing is waiting on you.
              asks: false,
              doneMs: Date.now() - item.startedAt,
            },
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

  const last = history.length ? history[history.length - 1] : undefined;
  const lastQuery = last ? last.query : "";

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
        className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.3] text-[#cccccc]"
      >
        <div className="text-[#00c200]">$ {b.cmd}</div>
        <div className="h-2" />
        <AgentBanner agent={agent} cwd={cwd} />
        <div className="h-2" />
        <div className="text-[#686868]">
          <span className="font-semibold text-[#919191]">
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
      <AgentComposer
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        onStop={stop}
        busy={busy}
        placeholder={busy ? "Working… press Stop to interrupt" : `Send to ${b.name}…`}
        inputRef={inputRef}
        onSuggest={() => fillInput(SUGGESTIONS[0])}
        onRecall={() => fillInput(lastQuery)}
        canRecall={!!lastQuery}
      >
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
                className={`rounded-full border border-[#2e2e2e] bg-[#242424] px-2.5 py-1 text-[10px] hover:bg-[#2a2a2a] ${b.color} ${PRESS} ${FOCUS_RING}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </AgentComposer>
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
