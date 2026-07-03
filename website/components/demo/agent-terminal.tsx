"use client";

import { useEffect, useRef, useState } from "react";

export type AgentKind = "claude" | "codex";
export type AgentStatus = "waiting" | "running" | "done";

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

function buildReply(query: string, agent: AgentKind): Step[] {
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
      { kind: "tool", label: "Read", arg: "package.json", result: "42 lines" },
      { kind: "tool", label: "Read", arg: "README.md", result: "108 lines" },
      { kind: "tool", label: "Glob", arg: "src/**/*.ts", result: "86 matches" },
      {
        kind: "text",
        text: "Next.js frontend in `app/`, Rails API in `api/`, Sidekiq workers for async jobs.",
      },
      { kind: "text", text: "", style: "muted" },
      {
        kind: "text",
        text: "Main flows: auth, billing, dashboard, teams. Want a deeper dive on any of them?",
      },
    ];
  }

  if (/test|spec|vitest|jest|rspec/.test(q)) {
    return [
      { kind: "thinking" },
      {
        kind: "tool",
        label: "Bash",
        arg: "pnpm test",
        result: "14 passed in 2.1s",
      },
      {
        kind: "text",
        text: "All 14 tests green. Auth, utils, and the button component all passed.",
      },
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
        arg: "src/lib/auth.ts",
        result: "142 lines",
      },
      {
        kind: "text",
        text:
          agent === "claude"
            ? "Found 3 TODOs in the auth module. Want me to patch them or walk you through what each one is blocking?"
            : "3 TODOs in auth/. I can draft a patch or leave them as-is — which?",
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
      { kind: "tool", label: "Read", arg: "scripts/deploy.sh", result: "68 lines" },
      {
        kind: "text",
        text: "Tree is clean. I can run `./scripts/deploy.sh production` when you're ready — but you'll want to run the full test suite first.",
      },
    ];
  }

  if (/refactor|clean|simplify|rewrite/.test(q)) {
    return [
      { kind: "thinking" },
      { kind: "tool", label: "Glob", arg: "src/**/*.ts", result: "86 matches" },
      {
        kind: "text",
        text: "Scanning for duplication and long functions. A few hotspots jump out in `src/lib/` — want me to propose a refactor plan before touching anything?",
      },
    ];
  }

  if (/add|implement|build|create|new/.test(q)) {
    return [
      { kind: "thinking" },
      { kind: "tool", label: "Read", arg: "src/lib/router.ts", result: "54 lines" },
      {
        kind: "tool",
        label: "Write",
        arg: "src/features/new-feature.ts",
        result: "draft",
      },
      {
        kind: "text",
        text: "Drafted a skeleton in `src/features/new-feature.ts`. Want me to wire it up into the router next?",
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
    { kind: "tool", label: "Read", arg: "package.json", result: "ok" },
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
    const steps = opts?.steps ?? buildReply(text, agent);
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
    // The agent launches idle, awaiting your first prompt (lpm's "waiting"
    // state) — unless it opens with work in flight (progress) or already
    // finished (done) via autoPrompt.
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
    } else {
      onStatusRef.current?.("waiting");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, input, busy, spinner]);

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
        ※ Tip: lpm launched {agent === "claude" ? "Claude" : "Codex"} in this
        project&apos;s root
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
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="rounded border border-[#2e2e2e] px-1 py-px">
                  @ mentions
                </span>
                <span className="rounded border border-[#2e2e2e] px-1 py-px">
                  / commands
                </span>
              </div>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex items-center gap-1 rounded-md bg-[#60a5fa] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a] transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                Send <span className="opacity-60">↵</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
