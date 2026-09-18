"use client";

import { useEffect, useRef, useState } from "react";
import { useStickToBottom } from "./use-stick-to-bottom";
import { INITIAL_AI_STATUS, type ReplyContext } from "./projects";
import { AgentBanner, AgentStatusLine, TurnFooter, WorkingLine } from "./agent-chrome";
import { AgentComposer } from "./agent-composer";
import {
  TYPE_CHAR_MS,
  TYPE_LEAD_MS,
  TYPE_SEND_MS,
  registerAgentDrive,
} from "./agent-drive";
import { ComposerModelPicker } from "./composer-model-picker";
import { INITIAL_PICK, statusModel, switchNotices, type ModelPick } from "./agent-models";
import { AgentTurn } from "./agent-turn";
import {
  AFFIRMATIVE,
  BRAND,
  DONE_STEPS,
  GENERIC_REPLY_CONTEXT,
  IN_PROGRESS_STEPS,
  buildReply,
  keepAliveSteps,
  settleStep,
  stepDelay,
  type AgentKind,
  type AgentStep as Step,
  type ReplyIntent,
} from "./agent-script";

export type AgentStatus = "running" | "waiting" | "done" | "error";

/** When the turn behind a status started, and when it landed. A turn still in
 *  flight reports no `until`, so the sidebar's clock counts up. */
export type AgentTurnTiming = { since: number; until?: number };

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

// When the demo loaded. Every seeded session dates from this one stamp, so the
// sidebar row, the Activity row and the transcript behind them read the same
// clock. The demo chunk is client-only, so there is no server render to differ.
export const DEMO_EPOCH = Date.now();

// What a seeded turn spent before it landed. A row that has finished reports
// the turn's own runtime, so the footer under the transcript and the row that
// opened it are one number rather than two.
export const SEEDED_TURN_MS = 52_000;

// How long each seeded session has been in the state a visitor first finds it
// in: still working, still holding its question, or — once it has landed — how
// long the turn behind it took.
export const SEEDED_AGENT_AGE_MS: Record<AgentStatus, number> = {
  running: 41_000,
  waiting: 4 * 60_000,
  done: SEEDED_TURN_MS,
  error: 18_000,
};

/** When a seeded session entered the state it is showing. */
export function seededSince(status: AgentStatus): number {
  return DEMO_EPOCH - SEEDED_AGENT_AGE_MS[status];
}

const projectName = (cwd: string) => cwd.slice(cwd.lastIndexOf("/") + 1);

/** The clock a session inherits when its tab opens. A project the visitor has
 *  not opened yet has had a row counting since the demo loaded, so the
 *  transcript behind it carries that reading on instead of restarting it;
 *  a session the visitor started — a duplicate, a second tab — has no such row
 *  and starts where it is opened. */
function seededStart(cwd: string, status: AgentStatus): number | undefined {
  return INITIAL_AI_STATUS[projectName(cwd)] === status
    ? seededSince(status)
    : undefined;
}

type AgentTerminalProps = {
  agent: AgentKind;
  cwd: string;
  replyContext?: ReplyContext;
  onStatus?: (status: AgentStatus, timing?: AgentTurnTiming) => void;
  // When set, the session opens with this prompt already sent. autoMode
  // "progress" streams a canned reply that never resolves (agent still
  // working); "done" shows the reply already finished (work already complete);
  // "waiting" shows a reply that stopped on a question, so the session is
  // holding for an answer the visitor can actually give.
  autoPrompt?: string;
  autoMode?: "progress" | "done" | "waiting";
  // What answering "yes" to a waiting session carries out. The intent decides
  // the fallback reply; answer steps, when given, are what actually runs, so a
  // seeded question can be answered in its own terms.
  autoIntent?: ReplyIntent;
  autoAnswerSteps?: Step[];
  autoSteps?: Step[];
  // Holds the autoPrompt back: the session opens on an empty composer, and the
  // prompt is typed into it when the tour — or the visitor clicking that step —
  // asks for it.
  autoDeferred?: boolean;
  // Registers this session with the tour, which types into its composer.
  driveKey?: string;
};

export function AgentTerminal({
  agent,
  cwd,
  replyContext,
  onStatus,
  autoPrompt,
  autoMode = "progress",
  autoSteps,
  autoIntent,
  autoAnswerSteps,
  autoDeferred,
  driveKey,
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
  // The reply a seeded question has already written, waiting on a yes.
  const pendingStepsRef = useRef<Step[] | undefined>(undefined);
  const keepAliveIdxRef = useRef(0);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  const ctx = replyContext ?? GENERIC_REPLY_CONTEXT;

  const runQuery = (
    text: string,
    opts?: { steps?: Step[]; keepBusy?: boolean; startedAt?: number },
  ) => {
    let steps = opts?.steps;
    let asks = false;
    if (!steps) {
      const answering = pendingStepsRef.current;
      if (answering && AFFIRMATIVE.test(text.trim().toLowerCase())) {
        steps = answering;
        pendingStepsRef.current = undefined;
        pendingRef.current = undefined;
      } else {
        const reply = buildReply(text, agent, ctx, pendingRef.current);
        steps = reply.steps;
        asks = reply.intent !== undefined;
        pendingRef.current = reply.intent;
        if (reply.intent === undefined) pendingStepsRef.current = undefined;
      }
    }
    if (steps.length === 0) return;
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    const startedAt = opts?.startedAt ?? Date.now();
    setHistory((h) => {
      const next = [
        ...h,
        {
          id,
          query: text,
          revealed: 0,
          steps,
          finished: false,
          startedAt,
          doneMs: 0,
          keepBusy: opts?.keepBusy,
          asks,
        },
      ];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setBusy(true);
    onStatusRef.current?.("running", { since: startedAt });
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
      const landedAt = Date.now();
      patch((x) => ({
        ...x,
        finished: true,
        keepBusy: false,
        doneMs: landedAt - x.startedAt,
        steps: closing ? [...x.steps, closing] : x.steps,
        revealed: x.steps.length + (closing ? 1 : 0),
      }));
      setBusy(false);
      // A turn that ends on a question is still on the clock — it counts how
      // long it has been waiting, the way the app's row does.
      onStatusRef.current?.(
        item.asks ? "waiting" : "done",
        item.asks ? { since: landedAt } : { since: item.startedAt, until: landedAt },
      );
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
    if (autoPrompt && autoMode === "progress" && !autoDeferred) {
      runQuery(autoPrompt, {
        steps: autoSteps ?? IN_PROGRESS_STEPS,
        keepBusy: true,
        startedAt: seededStart(cwd, "running"),
      });
    } else if (autoPrompt && autoMode === "done") {
      nextIdRef.current += 1;
      const startedAt = seededStart(cwd, "done") ?? Date.now() - SEEDED_TURN_MS;
      const landedAt = startedAt + SEEDED_TURN_MS;
      setHistory([
        {
          id: nextIdRef.current,
          query: autoPrompt,
          revealed: DONE_STEPS.length,
          steps: DONE_STEPS,
          finished: true,
          startedAt,
          doneMs: SEEDED_TURN_MS,
        },
      ]);
      // Without this the finished session never reports itself, so its sidebar
      // badge disappears for good the first time the project is opened.
      onStatusRef.current?.("done", { since: startedAt, until: landedAt });
    } else if (autoPrompt && autoMode === "waiting" && autoSteps) {
      nextIdRef.current += 1;
      const askedAt = seededStart(cwd, "waiting") ?? Date.now();
      setHistory([
        {
          id: nextIdRef.current,
          query: autoPrompt,
          revealed: autoSteps.length,
          steps: autoSteps,
          finished: true,
          startedAt: askedAt - SEEDED_TURN_MS,
          doneMs: SEEDED_TURN_MS,
          asks: true,
        },
      ]);
      // The question is live: "yes" in the composer runs it through the same
      // path a question asked during the visit would take.
      pendingRef.current = autoIntent;
      pendingStepsRef.current = autoAnswerSteps;
      // Counting from the question, not from the turn — the row reads how long
      // the agent has been held up.
      onStatusRef.current?.("waiting", { since: askedAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tour types a prompt in rather than filling the field: the visitor is
  // watching the composer, and a prompt that simply appears reads as a script.
  const typingRef = useRef<number | null>(null);
  const cancelTyping = () => {
    if (typingRef.current === null) return;
    window.clearTimeout(typingRef.current);
    typingRef.current = null;
  };
  useEffect(() => cancelTyping, []);

  const runQueryRef = useRef(runQuery);
  const driveRef = useRef<{
    send: (text: string, opts?: { instant?: boolean }) => void;
    idle: () => boolean;
  }>({ send: () => {}, idle: () => false });

  const idle = () =>
    history.length === 0 && !busy && typingRef.current === null;

  const sendTyped = (text: string, opts?: { instant?: boolean }) => {
    if (!idle()) return;
    // A prompt the session was opened with keeps the reply it was written for;
    // anything else goes through the same canned reply a visitor's own prompt
    // would get.
    const runOpts =
      text === autoPrompt && autoSteps
        ? { steps: autoSteps, keepBusy: true }
        : undefined;
    const send = () => {
      typingRef.current = null;
      setInput("");
      runQueryRef.current(text, runOpts);
    };
    if (opts?.instant) return send();
    // preventScroll: the field is inside the demo's own frame, and pulling it
    // into view would scroll the marketing page out from under the visitor.
    inputRef.current?.focus({ preventScroll: true });
    let typed = 0;
    const tick = () => {
      typed += 1;
      setInput(text.slice(0, typed));
      typingRef.current = window.setTimeout(
        typed < text.length ? tick : send,
        typed < text.length ? TYPE_CHAR_MS : TYPE_SEND_MS,
      );
    };
    typingRef.current = window.setTimeout(tick, TYPE_LEAD_MS);
  };

  useEffect(() => {
    runQueryRef.current = runQuery;
    driveRef.current = { send: sendTyped, idle };
  });

  useEffect(() => {
    if (!driveKey) return;
    return registerAgentDrive(driveKey, {
      send: (text, opts) => driveRef.current.send(text, opts),
      idle: () => driveRef.current.idle(),
      field: () => inputRef.current,
    });
  }, [driveKey]);

  // Mirrors the app's interrupt: the turn in flight settles where it stands
  // and the composer is free again.
  const stop = () => {
    const landedAt = Date.now();
    const inFlight = history.find((item) => !item.finished);
    setHistory((h) =>
      h.map((item) =>
        item.finished
          ? item
          : {
              ...item,
              finished: true,
              // Cut off before the question landed, so nothing is waiting on you.
              asks: false,
              doneMs: landedAt - item.startedAt,
            },
      ),
    );
    setBusy(false);
    onStatusRef.current?.("done", {
      since: inFlight?.startedAt ?? landedAt,
      until: landedAt,
    });
    inputRef.current?.focus();
  };

  // What this terminal's agent runs now. The composer's picker moves it, and the
  // status line follows — the banner above keeps what it printed at launch.
  const [pick, setPick] = useState<ModelPick>(() => INITIAL_PICK[agent]);
  // The lines the CLI printed to confirm a switch. They carry ids from the same
  // counter as the turns, so the transcript can put them back in the order they
  // happened rather than always at the end.
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);

  const applyPick = (next: ModelPick) => {
    const lines = switchNotices(agent, pick, next);
    setPick(next);
    if (lines.length === 0) return;
    setNotices((current) => [
      ...current,
      ...lines.map((text) => {
        nextIdRef.current += 1;
        return { id: nextIdRef.current, text };
      }),
    ]);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cancelTyping();
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
  const project = projectName(cwd);
  // Drives the status line's context/cost readouts, so they drift with the work
  // on screen instead of sitting at a constant.
  // One timeline: turns and switch confirmations, in the order they happened.
  const feed = [
    ...history.map((item) => ({ kind: "turn" as const, id: item.id, item })),
    ...notices.map((n) => ({ kind: "notice" as const, id: n.id, text: n.text })),
  ].sort((a, b) => a.id - b.id);

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
        <div className="text-[#8a8a8a]">
          <span className="font-semibold text-[#919191]">
            {agent === "claude" ? "※ Tip:" : "Tip:"}
          </span>{" "}
          lpm launched {agent === "claude" ? "Claude" : "Codex"} in this
          project&apos;s root
        </div>

        <div className="h-3" />

        {feed.map((entry) =>
          entry.kind === "notice" ? (
            <div key={`n${entry.id}`} className="py-1 text-[#919191]">
              {agent === "codex" && <span className="mr-1.5">{b.bullet}</span>}
              {entry.text}
            </div>
          ) : (
          <AgentTurn
            key={entry.item.id}
            agent={agent}
            query={entry.item.query}
            steps={entry.item.steps}
            revealed={entry.item.revealed}
            finished={entry.item.finished}
            footer={
              !entry.item.finished ? (
                <WorkingLine
                  agent={agent}
                  seed={entry.item.id}
                  startedAt={entry.item.startedAt}
                  tokens={tokensFor(entry.item)}
                />
              ) : agent === "claude" ? (
                <TurnFooter
                  seed={entry.item.id}
                  seconds={Math.max(1, Math.round(entry.item.doneMs / 1000))}
                />
              ) : null
            }
          />
          ),
        )}
      </div>
      <AgentStatusLine
        agent={agent}
        project={project}
        work={work}
        model={statusModel(agent, pick)}
      />
      <AgentComposer
        value={input}
        onChange={(value) => {
          // Typing over a prompt the tour is still entering is the visitor
          // taking the composer back.
          cancelTyping();
          setInput(value);
        }}
        onSubmit={onSubmit}
        busy={busy}
        placeholder={busy ? "Working… send to interrupt" : `Send to ${b.name}…`}
        inputRef={inputRef}
        onRecall={() => fillInput(lastQuery)}
        canRecall={!!lastQuery}
        workingSince={history[history.length - 1]?.finished === false
          ? history[history.length - 1].startedAt
          : undefined}
        trailing={<ComposerModelPicker agent={agent} pick={pick} onPick={applyPick} />}
      />
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
