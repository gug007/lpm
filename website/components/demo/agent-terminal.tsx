"use client";

import { useEffect, useRef, useState } from "react";

export type AgentKind = "claude" | "codex";

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
};

export function AgentTerminal({ agent, cwd }: AgentTerminalProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);

  const spinner = useSpinnerFrame(busy);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, input, busy, spinner]);

  const runQuery = (text: string) => {
    const steps = buildReply(text, agent);
    if (steps.length === 0) return;
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setHistory((h) => [
      ...h,
      { id, query: text, revealed: 0, steps, finished: false },
    ]);
    setBusy(true);

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
        if (isLast) {
          window.setTimeout(() => {
            setHistory((h) =>
              h.map((item) =>
                item.id === id ? { ...item, finished: true } : item,
              ),
            );
            setBusy(false);
          }, 220);
        }
      }, acc);
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    runQuery(text);
  };

  const brand = agent === "claude" ? "✻" : "◆";
  const brandColor =
    agent === "claude" ? "text-fuchsia-300" : "text-cyan-300";
  const promptGlyph = agent === "claude" ? ">" : "▶";
  const toolBullet = agent === "claude" ? "●" : "▸";
  const welcomeTitle =
    agent === "claude" ? "Welcome to Claude Code!" : "Codex CLI · ready";
  const welcomeHelp =
    agent === "claude"
      ? "/help for help · /status for your setup"
      : "/help · /model · /resume";

  return (
    <div
      ref={scrollRef}
      onClick={() => inputRef.current?.focus()}
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-[#1a1a1a] text-gray-100"
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

      <form onSubmit={onSubmit} className="flex items-start gap-2 mt-2">
        <span className={brandColor}>{promptGlyph}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder={
            busy ? "" : agent === "claude" ? "Ask anything…" : "Describe a task…"
          }
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 bg-transparent outline-none text-gray-100 font-mono placeholder:text-gray-600 caret-gray-100 disabled:opacity-50"
        />
      </form>
    </div>
  );
}
