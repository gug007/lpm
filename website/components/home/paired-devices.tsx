"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BatteryFull,
  MonitorSmartphone,
  Signal,
  Wifi,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH } from "@/lib/links";

type Tone =
  | "prompt"
  | "agent"
  | "detail"
  | "ok"
  | "meta"
  | "claudeTitle"
  | "codexTitle";
type Line = { text: string; tone: Tone };
// preamble = launch-header lines already on screen when the tab activates
type Session = { key: string; label: string; preamble: number; lines: Line[] };

const CLAUDE_LINES: Line[] = [
  { text: "✳ Claude Code v2.1.214", tone: "claudeTitle" },
  { text: "  Fable 5 with high effort · Claude Max", tone: "meta" },
  { text: "  ~/Projects/auth-service", tone: "meta" },
  { text: "> tighten the login rate limiter", tone: "prompt" },
  { text: "● Read(src/auth/rateLimiter.ts)", tone: "agent" },
  { text: "  ⎿ Read 84 lines", tone: "detail" },
  { text: "● Update(src/auth/rateLimiter.ts)", tone: "agent" },
  { text: "  ⎿ Updated with 18 additions and 4 removals", tone: "detail" },
  { text: "● Bash(npm test -- rateLimiter)", tone: "agent" },
  { text: "  ⎿ 8 passed, 0 failed (2.1s)", tone: "ok" },
  { text: "● The limiter now blocks after 5 attempts and", tone: "agent" },
  { text: "  resets on success. Commit and open a PR?", tone: "agent" },
  { text: "> yes — commit & open the PR", tone: "prompt" },
  { text: "● Bash(git push && gh pr create)", tone: "agent" },
  { text: "  ⎿ PR #204 opened", tone: "ok" },
];

const CODEX_LINES: Line[] = [
  { text: "$ codex", tone: "prompt" },
  { text: ">_ OpenAI Codex (v0.144.5)", tone: "codexTitle" },
  { text: "  model: gpt-5.6-sol high · /model to change", tone: "meta" },
  { text: "  directory: ~/Projects/auth-service", tone: "meta" },
  { text: "▌ add cursor pagination to GET /users", tone: "prompt" },
  { text: "• Explored", tone: "agent" },
  { text: "  └ routes/users.ts, models/user.ts", tone: "detail" },
  { text: "• Edited routes/users.ts (+24 -6)", tone: "agent" },
  { text: "• Ran npm test", tone: "agent" },
  { text: "  └ 14 passed (1.2s)", tone: "ok" },
  { text: "• Added ?limit & ?cursor with stable ordering", tone: "agent" },
  { text: "  Worked for 9s", tone: "meta" },
];

const ZSH_LINES: Line[] = [
  { text: "$ ls", tone: "prompt" },
  { text: "README.md  package.json  routes  src  tests", tone: "agent" },
  { text: "$ git status -s", tone: "prompt" },
  { text: " M src/auth/rateLimiter.ts", tone: "detail" },
  { text: " M routes/users.ts", tone: "detail" },
  { text: "$ lpm start", tone: "prompt" },
  { text: "  ✓ api :4000 · web :3000", tone: "ok" },
];

const SESSIONS: Session[] = [
  { key: "claude", label: "claude", preamble: 3, lines: CLAUDE_LINES },
  { key: "codex", label: "codex", preamble: 4, lines: CODEX_LINES },
  { key: "zsh", label: "zsh", preamble: 0, lines: ZSH_LINES },
];

const PROJECTS = [
  { name: "auth-service", running: true, active: true },
  { name: "storefront", running: false, active: false },
  { name: "ml-pipeline", running: false, active: false },
];

// index 12 of the claude session is the prompt the phone types during the
// "take control" beat.
const CONTROL_INDEX = 12;
const CONTROL_TEXT = "yes — commit & open the PR";

const TONE_CLASS: Record<
  Exclude<Tone, "prompt" | "claudeTitle" | "codexTitle">,
  string
> = {
  agent: "text-gray-100",
  detail: "text-gray-500",
  ok: "text-emerald-400",
  meta: "text-gray-500",
};

function TerminalLine({ line, size }: { line: Line; size: string }) {
  const base = `whitespace-pre tabular-nums ${size}`;
  if (line.tone === "prompt") {
    return (
      <div className={base}>
        <span className="text-gray-600">{line.text.slice(0, 2)}</span>
        <span className="text-gray-300">{line.text.slice(2)}</span>
      </div>
    );
  }
  if (line.tone === "claudeTitle" || line.tone === "codexTitle") {
    return (
      <div className={base}>
        <span
          className={
            line.tone === "claudeTitle" ? "text-[#d97757]" : "text-gray-500"
          }
        >
          {line.text.slice(0, 2)}
        </span>
        <span className="font-semibold text-gray-100">
          {line.text.slice(2)}
        </span>
      </div>
    );
  }
  return <div className={`${base} ${TONE_CLASS[line.tone]}`}>{line.text}</div>;
}

type Step = { wait: number; apply: () => void };

export function PairedDevices({
  companionLink = true,
}: {
  companionLink?: boolean;
}) {
  const [tab, setTab] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [control, setControl] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced) return;

    const steps: Step[] = [];
    const goTab = (t: number, wait: number) =>
      steps.push({
        wait,
        apply: () => {
          setTab(t);
          setRevealed(SESSIONS[t].preamble);
        },
      });
    const reveal = (n: number, wait: number) =>
      steps.push({ wait, apply: () => setRevealed(n) });
    const hold = (wait: number) => steps.push({ wait, apply: () => {} });

    // claude — the agent works, then the phone takes control
    const claudeStart = SESSIONS[0].preamble + 1;
    steps.push({
      wait: 450,
      apply: () => {
        setTab(0);
        setRevealed(SESSIONS[0].preamble);
        setTyped("");
        setTyping(false);
        setControl(false);
      },
    });
    for (let i = claudeStart; i <= CONTROL_INDEX; i += 1) {
      reveal(i, i === claudeStart ? 720 : 620);
    }
    steps.push({
      wait: 780,
      apply: () => {
        setControl(true);
        setTyping(true);
      },
    });
    for (let c = 1; c <= CONTROL_TEXT.length; c += 1) {
      const slice = CONTROL_TEXT.slice(0, c);
      steps.push({ wait: 52, apply: () => setTyped(slice) });
    }
    steps.push({
      wait: 560,
      apply: () => {
        setRevealed(CONTROL_INDEX + 1);
        setTyped("");
        setTyping(false);
      },
    });
    for (let i = CONTROL_INDEX + 2; i <= CLAUDE_LINES.length; i += 1) {
      reveal(i, i === CONTROL_INDEX + 2 ? 850 : 620);
    }
    steps.push({ wait: 720, apply: () => setControl(false) });
    hold(1400);

    // codex — a second agent on its own tab
    goTab(1, 400);
    const codexStart = SESSIONS[1].preamble + 1;
    for (let i = codexStart; i <= CODEX_LINES.length; i += 1) {
      reveal(i, i === codexStart ? 720 : 620);
    }
    hold(1600);

    // zsh — plain shell commands, output lands instantly
    goTab(2, 400);
    ZSH_LINES.forEach((line, i) =>
      reveal(i + 1, line.tone === "prompt" ? 900 : 350),
    );
    hold(1800);

    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const step = steps[idx];
      timer = setTimeout(() => {
        step.apply();
        idx = (idx + 1) % steps.length;
        run();
      }, step.wait);
    };
    run();
    return () => clearTimeout(timer);
  }, [reduced]);

  const tabView = reduced ? 0 : tab;
  const session = SESSIONS[tabView];
  const visible = reduced ? session.lines : session.lines.slice(0, revealed);
  const isTyping = typing && !reduced;
  const isControl = control && !reduced;
  const streaming =
    !reduced && !isTyping && revealed > 0 && revealed < session.lines.length;

  return (
    <section className="py-16 sm:py-20 overflow-x-clip">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className="mb-12"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="relative inline-flex h-1.5 w-1.5"
                aria-hidden="true"
              >
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Desktop + iPhone
            </span>
          }
          title="The same terminal, on your Mac and in your pocket"
          description="Pair your iPhone and lpm mirrors every terminal live — watch an agent work, then take control and type right from your phone."
        />

        <p className="sr-only">
          An illustration of one project&rsquo;s terminals mirrored in real time
          between a Mac window and an iPhone: a Claude Code agent tightening a
          login rate limiter, a Codex agent adding pagination, and a zsh shell
          running commands like ls. Both screens always show the identical
          active terminal; the phone takes control of the Claude session and
          sends &ldquo;yes — commit &amp; open the PR&rdquo;, which appears on
          both devices at once.
        </p>

        <div
          aria-hidden="true"
          className="relative flex flex-col items-center justify-center sm:flex-row"
        >
          <div className="pointer-events-none absolute -inset-x-8 -inset-y-10 bg-grid" />
          {/* MacBook running lpm — sidebar, terminal tabs, streaming pane */}
          <div className="relative w-full min-w-0 max-w-[32rem]">
            <div className="mx-auto w-[94%] overflow-hidden rounded-t-xl bg-[#111113] p-1.5 pb-0 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]">
              <div className="flex h-[20rem] flex-col overflow-hidden rounded-t-md bg-[#1a1a1a]">
                <div className="relative flex h-7 shrink-0 items-center border-b border-[#2d2d2d] px-2.5">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                    <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                    <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
                    lpm
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[9px] font-medium text-emerald-400">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live
                  </span>
                </div>
                <div className="flex min-h-0 flex-1">
                  {/* Projects sidebar */}
                  <div className="flex w-[7rem] shrink-0 flex-col gap-0.5 border-r border-[#262626] bg-[#161616] p-1.5">
                    <span className="px-1.5 pb-1 pt-0.5 text-[7px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                      Projects
                    </span>
                    {PROJECTS.map((p) => (
                      <span
                        key={p.name}
                        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[9px] ${
                          p.active
                            ? "bg-white/[0.07] text-gray-200"
                            : "text-gray-500"
                        }`}
                      >
                        <span
                          className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                            p.running
                              ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.7)]"
                              : "border border-[#454545]"
                          }`}
                        />
                        {p.name}
                      </span>
                    ))}
                  </div>
                  {/* Terminal pane */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-0.5 border-b border-[#2d2d2d] bg-[#222222] px-1.5 py-1">
                      {SESSIONS.map((s, i) => (
                        <span
                          key={s.key}
                          className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors ${
                            i === tabView
                              ? "bg-white/[0.1] text-gray-200"
                              : "text-[#8e8e8e]"
                          }`}
                        >
                          {i === tabView && (
                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                          )}
                          {s.label}
                        </span>
                      ))}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 py-2.5 font-mono text-[10.5px] leading-5 [mask-image:linear-gradient(to_right,#000_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_92%,transparent)]">
                      {visible.map((line, i) => (
                        <TerminalLine key={i} line={line} size="text-[10.5px]" />
                      ))}
                      {streaming && (
                        <span className="mt-0.5 inline-block h-3 w-1.5 bg-gray-300 [animation:pd-blink_1.05s_steps(1)_infinite]" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Aluminum deck */}
            <div className="relative h-2.5 w-full rounded-b-lg bg-gradient-to-b from-[#e7e8ea] via-[#c9cbcd] to-[#9fa1a4] shadow-lg shadow-gray-400/30 dark:from-[#48484c] dark:via-[#333336] dark:to-[#1f1f22] dark:shadow-black/60">
              <span className="absolute left-1/2 top-0 h-[5px] w-14 -translate-x-1/2 rounded-b-md bg-[#b7b9bc] dark:bg-[#28282b]" />
            </div>
          </div>

          {/* Sync link — glass capsule on an animated beam */}
          <div className="relative flex h-20 w-full items-center justify-center overflow-hidden sm:hidden">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 dark:bg-[#3a3a3c]" />
            {!reduced && (
              <>
                <span className="absolute left-1/2 h-5 w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent to-emerald-400 [animation:pd-spine-down_2.4s_ease-in-out_infinite]" />
                <span className="absolute left-1/2 h-5 w-px -translate-x-1/2 rounded-full bg-gradient-to-t from-transparent to-emerald-400/70 [animation:pd-spine-up_2.4s_ease-in-out_infinite]" />
              </>
            )}
            <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-gray-200/70 bg-white/85 px-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
              <MonitorSmartphone className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              <span className="whitespace-nowrap text-[9px] font-medium text-gray-500 dark:text-gray-300">
                Mirrored live
              </span>
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>
          </div>
          <div className="relative z-10 hidden h-72 w-36 shrink-0 overflow-hidden sm:-ml-4 sm:block">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-300 dark:bg-[#3a3a3c]" />
            {!reduced && (
              <>
                <span className="absolute top-1/2 h-px w-10 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-emerald-400 [animation:pd-spine-right_2.4s_ease-in-out_infinite]" />
                <span className="absolute top-1/2 h-px w-10 -translate-y-1/2 rounded-full bg-gradient-to-l from-transparent to-emerald-400/70 [animation:pd-spine-left_2.4s_ease-in-out_infinite]" />
              </>
            )}
            <div className="absolute left-1/2 top-1/2 z-10 -mt-2 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full border border-gray-200/70 bg-white/85 px-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
              <MonitorSmartphone className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              <span className="whitespace-nowrap text-[9px] font-medium text-gray-500 dark:text-gray-300">
                Mirrored live
              </span>
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>
          </div>

          {/* iPhone 17 Pro — mirrors the same session, then drives it */}
          <div className="shrink-0">
            <div className="relative aspect-[71.9/150] w-[14.5rem] rounded-[2.6rem] bg-gradient-to-b from-[#48484c] via-[#2b2b2e] to-[#48484c] p-[2px] shadow-xl shadow-gray-400/25 dark:shadow-black/70">
              {/* Side buttons */}
              <span className="absolute -left-[2px] top-24 h-5 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -left-[2px] top-[8.5rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -left-[2px] top-[11.25rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -right-[2px] top-[10rem] h-12 w-[2px] rounded-r-sm bg-[#3a3a3c]" />
              <div className="h-full rounded-[2.5rem] bg-black p-1">
                <div className="relative flex h-full flex-col overflow-hidden rounded-[2.3rem] bg-[#1a1a1a]">
                  {/* iOS status bar + Dynamic Island */}
                  <div className="relative flex items-center justify-between px-5 pb-1 pt-2.5">
                    <span className="text-[10px] font-semibold tabular-nums text-gray-100">
                      9:41
                    </span>
                    <span className="absolute left-1/2 top-1.5 flex h-5 w-16 -translate-x-1/2 items-center justify-end rounded-full bg-black pr-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16222e]" />
                    </span>
                    <span className="flex items-center gap-1 text-gray-100">
                      <Signal className="h-2.5 w-2.5" strokeWidth={2.5} />
                      <Wifi className="h-2.5 w-2.5" strokeWidth={2.5} />
                      <BatteryFull className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </span>
                  </div>

                  {/* App header */}
                  <div className="flex items-center justify-between px-3.5 pb-1.5 pt-2">
                    <span className="text-[10px] font-medium text-gray-300">
                      auth-service
                    </span>
                    {isControl ? (
                      <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[8px] font-semibold text-white">
                        You&rsquo;re in control
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[8px] font-semibold text-emerald-400">
                        <span className="h-1 w-1 rounded-full bg-emerald-400" />
                        Live
                      </span>
                    )}
                  </div>

                  {/* Mirrored transcript; right edge fades so the narrow phone
                      mirror clips long lines gracefully. */}
                  <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pb-2 font-mono text-[10px] leading-5 [mask-image:linear-gradient(to_right,#000_84%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_84%,transparent)]">
                    {visible.map((line, i) => (
                      <TerminalLine key={i} line={line} size="text-[10px]" />
                    ))}
                  </div>

                  {/* Composer — caret + typed prompt during the control beat */}
                  <div className="px-2.5 pb-1">
                    <div
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[10px] transition-colors ${
                        isTyping
                          ? "border-emerald-500/50 bg-emerald-500/[0.06]"
                          : "border-[#2e2e2e] bg-[#111]"
                      }`}
                    >
                      <span className="text-gray-600">{"> "}</span>
                      {isTyping ? (
                        <>
                          <span className="text-gray-200">{typed}</span>
                          <span className="inline-block h-3 w-px bg-emerald-400 [animation:pd-blink_1s_steps(1)_infinite]" />
                        </>
                      ) : (
                        <span className="text-gray-600">
                          {isControl ? "Message the agent…" : "Mirroring live…"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Home indicator */}
                  <div className="flex justify-center pb-1.5 pt-0.5">
                    <span className="h-1 w-20 rounded-full bg-white/25" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {companionLink && (
          <div className="mt-10 text-center">
            <a
              href={MOBILE_PATH}
              className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              See the iPhone companion
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
