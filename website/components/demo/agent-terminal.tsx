"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { History, Mic, Plus, Send, Sparkles } from "lucide-react";
import type { ReplyContext } from "./projects";

export type AgentKind = "claude" | "codex";
export type AgentStatus = "running" | "done";

type Brand = {
  glyph: string;
  color: string;
  prompt: string;
  bullet: string;
  title: string;
  help: string;
  name: string;
};

const BRAND: Record<AgentKind, Brand> = {
  claude: {
    glyph: "✻",
    color: "text-fuchsia-300",
    prompt: ">",
    bullet: "●",
    title: "Welcome to Claude Code!",
    help: "/help for help · /status for your setup",
    name: "Claude Code",
  },
  codex: {
    glyph: "◆",
    color: "text-cyan-300",
    prompt: "▶",
    bullet: "▸",
    title: "Codex CLI · ready",
    help: "/help · /model · /resume",
    name: "Codex",
  },
};

// A canned session that streams agent work and then holds on a live "Thinking…"
// spinner — used to show a project mid-task ("in progress") the moment you open
// it. It never resolves on its own, so the sidebar stays in the running state.
const IN_PROGRESS_STEPS: Step[] = [
  { kind: "thinking" },
  { kind: "tool", label: "Read", arg: "internal/auth/jwt.go", result: "212 lines" },
  { kind: "tool", label: "Grep", arg: "RotateSigningKey", result: "6 matches" },
  {
    kind: "text",
    text: "Rotating the signing key on a schedule and keeping a grace window so in-flight tokens stay valid.",
  },
  { kind: "tool", label: "Edit", arg: "internal/auth/rotation.go", result: "+48 -6" },
  { kind: "tool", label: "Bash", arg: "go test ./internal/auth/...", result: "running…" },
  { kind: "thinking" },
];

// A finished session — shown fully revealed when a project opens with work
// already complete.
const DONE_STEPS: Step[] = [
  { kind: "thinking" },
  { kind: "tool", label: "Glob", arg: "src/pages/api/**/*.ts", result: "24 routes" },
  { kind: "tool", label: "Read", arg: "src/content/reference.mdx", result: "88 lines" },
  { kind: "tool", label: "Write", arg: "src/content/reference.mdx", result: "+312 -74" },
  {
    kind: "text",
    text: "Regenerated the API reference from the current routes — 24 endpoints grouped by resource, each with request and response examples.",
  },
  {
    kind: "text",
    text: "The dev server hot-reloaded; the updated page is live at /reference.",
    style: "muted",
  },
];

type Step =
  | { kind: "thinking" }
  | { kind: "tool"; label: string; arg: string; result: string }
  | { kind: "text"; text: string; style?: "default" | "muted" };

type HistoryItem = {
  id: number;
  query: string;
  revealed: number;
  steps: Step[];
  finished: boolean;
};

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_HISTORY = 30;

function useSpinnerFrame(active: boolean): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(
      () => setI((v) => (v + 1) % SPINNER.length),
      80,
    );
    return () => window.clearInterval(id);
  }, [active]);
  return SPINNER[i];
}

const GENERIC_REPLY_CONTEXT: ReplyContext = {
  manifest: "README.md",
  manifestLines: "64 lines",
  sourceGlob: "**/*",
  sourceMatches: "37 matches",
  overview: "Fresh project — nothing indexed yet beyond the files on disk.",
  flows: "Point me at what you're building and I'll dig in.",
  testCmd: "make test",
  testResult: "no tests configured",
  testSummary: "No test suite wired up yet. Want me to scaffold one?",
  focusFile: "README.md",
  focusLines: "64 lines",
  focusArea: "this project",
  hotspotDir: "./",
  deployFile: "README.md",
  deployCmd: "make deploy",
  draftFile: "src/new-feature.ts",
  wireTarget: "the entry point",
};

function buildReply(
  query: string,
  agent: AgentKind,
  ctx: ReplyContext = GENERIC_REPLY_CONTEXT,
): Step[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (/^(hi|hello|hey|yo)\b/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "text",
        text:
          agent === "claude"
            ? "Hey! What can I help you with in this project?"
            : "Hi. What do you want to work on?",
      },
    ];
  }

  if (/what (is|does)|explain|tell me|overview|summary|describe/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Read",
        arg: ctx.manifest,
        result: ctx.manifestLines,
      },
      { kind: "tool", label: "Read", arg: "README.md", result: "108 lines" },
      {
        kind: "tool",
        label: "Glob",
        arg: ctx.sourceGlob,
        result: ctx.sourceMatches,
      },
      { kind: "text", text: ctx.overview },
      { kind: "text", text: "", style: "muted" },
      { kind: "text", text: ctx.flows },
    ];
  }

  if (/test|spec|vitest|jest|rspec/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Bash",
        arg: ctx.testCmd,
        result: ctx.testResult,
      },
      { kind: "text", text: ctx.testSummary },
    ];
  }

  if (/fix|bug|error|failing|broken|crash/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Grep",
        arg: "TODO|FIXME",
        result: "3 matches",
      },
      {
        kind: "tool",
        label: "Read",
        arg: ctx.focusFile,
        result: ctx.focusLines,
      },
      {
        kind: "text",
        text:
          agent === "claude"
            ? `Found 3 TODOs in ${ctx.focusArea}. Want me to patch them or walk you through what each one is blocking?`
            : `3 TODOs in ${ctx.focusArea}. I can draft a patch or leave them as-is — which?`,
      },
    ];
  }

  if (/deploy|ship|release|production/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Bash",
        arg: "git status --porcelain",
        result: "clean",
      },
      { kind: "tool", label: "Read", arg: ctx.deployFile, result: "68 lines" },
      {
        kind: "text",
        text: `Tree is clean. I can run \`${ctx.deployCmd}\` when you're ready — but you'll want to run the full test suite first.`,
      },
    ];
  }

  if (/refactor|clean|simplify|rewrite/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Glob",
        arg: ctx.sourceGlob,
        result: ctx.sourceMatches,
      },
      {
        kind: "text",
        text: `Scanning for duplication and long functions. A few hotspots jump out in \`${ctx.hotspotDir}\` — want me to propose a refactor plan before touching anything?`,
      },
    ];
  }

  if (/add|implement|build|create|new/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Read",
        arg: ctx.focusFile,
        result: ctx.focusLines,
      },
      { kind: "tool", label: "Write", arg: ctx.draftFile, result: "draft" },
      {
        kind: "text",
        text: `Drafted a skeleton in \`${ctx.draftFile}\`. Want me to wire it up into ${ctx.wireTarget} next?`,
      },
    ];
  }

  if (/document|docs|readme|comments/.test(q)) {
    return [
      { kind: "thinking" },
      { kind: "tool", label: "Read", arg: "README.md", result: "108 lines" },
      {
        kind: "text",
        text: "README covers setup but the API section is stale. I can regenerate it from the current routes if that's useful.",
      },
    ];
  }

  if (/^(thanks|thank you|ok|okay|cool|great|nice|perfect)\b/.test(q)) {
    return [{ kind: "text", text: agent === "claude" ? "Anytime." : "👍" }];
  }

  return [
    { kind: "thinking" },
    { kind: "tool", label: "Read", arg: ctx.manifest, result: "ok" },
    {
      kind: "text",
      text:
        agent === "claude"
          ? "Got it — taking a look. Want me to just describe the plan, or go ahead and make the change?"
          : "Looking now. Draft a plan or apply changes directly?",
    },
  ];
}

function stepDelay(step: Step): number {
  if (step.kind === "thinking") return 650;
  if (step.kind === "tool") return 380;
  return step.text ? 260 : 90;
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
};

export function AgentTerminal({
  agent,
  cwd,
  replyContext,
  onStatus,
  autoPrompt,
  autoMode = "progress",
}: AgentTerminalProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  const spinner = useSpinnerFrame(busy);

  const runQuery = (
    text: string,
    opts?: { steps?: Step[]; keepBusy?: boolean },
  ) => {
    const steps = opts?.steps ?? buildReply(text, agent, replyContext);
    if (steps.length === 0) return;
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setHistory((h) => {
      const next = [...h, { id, query: text, revealed: 0, steps, finished: false }];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setBusy(true);
    onStatusRef.current?.("running");

    let acc = 0;
    steps.forEach((step, i) => {
      acc += stepDelay(step);
      const isLast = i === steps.length - 1;
      window.setTimeout(() => {
        setHistory((h) =>
          h.map((item) =>
            item.id === id ? { ...item, revealed: i + 1 } : item,
          ),
        );
        // keepBusy leaves the session on its final live spinner (still
        // "running") instead of settling — an agent that stays mid-task.
        if (isLast && !opts?.keepBusy) {
          window.setTimeout(() => {
            setHistory((h) =>
              h.map((item) =>
                item.id === id ? { ...item, finished: true } : item,
              ),
            );
            setBusy(false);
            onStatusRef.current?.("done");
          }, 220);
        }
      }, acc);
    });
  };

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // The agent launches idle, awaiting your first prompt — unless it opens
    // with work in flight (progress) or already finished (done) via autoPrompt.
    if (autoPrompt && autoMode === "progress") {
      runQuery(autoPrompt, { steps: IN_PROGRESS_STEPS, keepBusy: true });
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, input, busy]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    runQuery(text);
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
                      {active ? spinner : "✓"}
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
        <form onSubmit={onSubmit}>
          <div className="rounded-lg border border-[#2e2e2e] bg-[#202020] px-2.5 py-2 transition-colors focus-within:border-[#3a3a3a]">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder={busy ? "Working…" : `Send to ${agentName}…`}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className="w-full bg-transparent text-[12px] text-gray-100 outline-none placeholder:text-gray-600 caret-gray-100 disabled:opacity-50"
            />
            <div className="mt-1.5 flex items-center justify-end gap-0.5">
              <ComposerIcon title="Dictate">
                <Mic className="h-3.5 w-3.5" />
              </ComposerIcon>
              <ComposerIcon title="AI actions">
                <Sparkles className="h-3.5 w-3.5" />
              </ComposerIcon>
              <ComposerIcon title="New input">
                <Plus className="h-4 w-4" />
              </ComposerIcon>
              <ComposerIcon title="Message history">
                <History className="h-3.5 w-3.5" />
              </ComposerIcon>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                title="Send"
                className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-[#60a5fa] text-[#1a1a1a] transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ComposerIcon({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
    >
      {children}
    </button>
  );
}
