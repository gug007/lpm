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

type Tone = "prompt" | "agent" | "detail" | "ok" | "meta";
type Line = { text: string; tone: Tone };

const TRANSCRIPT: Line[] = [
  { text: "> tighten the login rate limiter", tone: "prompt" },
  { text: "● Reading src/auth/rateLimiter.ts", tone: "agent" },
  { text: "● Editing src/auth/rateLimiter.ts", tone: "agent" },
  { text: "  ⎿ +18 −4", tone: "detail" },
  { text: "● Running tests…", tone: "agent" },
  { text: "  ✓ blocks after 5 attempts", tone: "ok" },
  { text: "  ✓ resets window on success", tone: "ok" },
  { text: "  8 passed · 0 failed", tone: "meta" },
  { text: "● Ready to ship. Commit and open a PR?", tone: "agent" },
  { text: "> yes — commit & open the PR", tone: "prompt" },
  { text: "● Pushed feat/rate-limit · PR #204 opened", tone: "agent" },
];

// index 9 is the prompt the phone types during the "take control" beat.
const CONTROL_INDEX = 9;
const CONTROL_TEXT = "yes — commit & open the PR";

const TONE_CLASS: Record<Exclude<Tone, "prompt">, string> = {
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
        <span className="text-gray-600">{"> "}</span>
        <span className="text-gray-300">{line.text.slice(2)}</span>
      </div>
    );
  }
  return <div className={`${base} ${TONE_CLASS[line.tone]}`}>{line.text}</div>;
}

type Step = { wait: number; apply: () => void };

export function PairedDevices() {
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
    steps.push({
      wait: 450,
      apply: () => {
        setRevealed(0);
        setTyped("");
        setTyping(false);
        setControl(false);
      },
    });
    for (let i = 1; i <= CONTROL_INDEX; i += 1) {
      steps.push({ wait: i === 1 ? 520 : 620, apply: () => setRevealed(i) });
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
    steps.push({ wait: 850, apply: () => setRevealed(TRANSCRIPT.length) });
    steps.push({ wait: 720, apply: () => setControl(false) });
    steps.push({ wait: 1600, apply: () => {} });

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

  const visible = reduced ? TRANSCRIPT : TRANSCRIPT.slice(0, revealed);
  const isTyping = typing && !reduced;
  const isControl = control && !reduced;
  const streaming =
    !reduced && !isTyping && revealed > 0 && revealed < TRANSCRIPT.length;

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
          An illustration of one AI coding session — tightening a login rate
          limiter — mirrored in real time on a Mac terminal window and an iPhone.
          Both screens stream the identical transcript in sync; the phone then
          takes control and sends &ldquo;yes — commit &amp; open the PR&rdquo;,
          which appears on both devices at once.
        </p>

        <div
          aria-hidden="true"
          className="relative flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-0"
        >
          <div className="pointer-events-none absolute -inset-x-8 -inset-y-10 bg-grid" />
          {/* Mac window — shows the full running transcript */}
          <div className="relative w-full min-w-0 max-w-[30rem]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-[#1a1a1a] shadow-2xl shadow-gray-300/50 dark:border-[#2e2e2e] dark:shadow-black/60">
              <div className="relative flex items-center border-b border-[#2d2d2d] px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 text-[11px] text-gray-400">
                  claude — auth-service
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>
              <div className="flex h-64 flex-col justify-end px-4 py-3 font-mono text-[11px] leading-5">
                {visible.map((line, i) => (
                  <TerminalLine key={i} line={line} size="text-[11px]" />
                ))}
                {streaming && (
                  <span className="mt-0.5 inline-block h-3 w-1.5 bg-gray-300 [animation:pd-blink_1.05s_steps(1)_infinite]" />
                )}
              </div>
            </div>
          </div>

          {/* Sync spine — whisper-quiet mirror link */}
          <div className="relative h-10 w-px sm:hidden">
            <div className="absolute inset-y-0 left-0 border-l border-dashed border-gray-300 dark:border-[#333]" />
          </div>
          <div className="relative z-10 hidden h-72 w-28 shrink-0 sm:block">
            <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-gray-300 dark:border-[#333]" />
            {!reduced && (
              <>
                <span className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(16,185,129,0.7)] [animation:pd-spine-right_2.8s_ease-in-out_infinite]" />
                <span className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400/50 [animation:pd-spine-left_2.8s_ease-in-out_infinite]" />
              </>
            )}
            <div className="absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm dark:border-[#2e2e2e] dark:bg-[#1a1a1a]">
              <MonitorSmartphone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </div>
            <span className="absolute left-1/2 top-1/2 mt-7 -translate-x-1/2 whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
              Mirrored live
            </span>
          </div>

          {/* iPhone — mirrors the same session, then drives it */}
          <div className="shrink-0">
            <div className="relative w-[14.5rem] rounded-[2.9rem] bg-gradient-to-b from-[#48484c] via-[#2b2b2e] to-[#48484c] p-[3px] shadow-xl shadow-gray-400/25 dark:shadow-black/70">
              {/* Side buttons */}
              <span className="absolute -left-[2px] top-20 h-5 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -left-[2px] top-[7.5rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -left-[2px] top-[10.25rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
              <span className="absolute -right-[2px] top-[8.5rem] h-12 w-[2px] rounded-r-sm bg-[#3a3a3c]" />
              <div className="rounded-[2.75rem] bg-black p-[7px]">
                <div className="relative flex flex-col overflow-hidden rounded-[2.25rem] bg-[#1a1a1a]">
                  {/* iOS status bar + Dynamic Island */}
                  <div className="relative flex items-center justify-between px-5 pb-1 pt-2.5">
                    <span className="text-[10px] font-semibold tabular-nums text-gray-100">
                      9:41
                    </span>
                    <span className="absolute left-1/2 top-2 flex h-[1.1rem] w-16 -translate-x-1/2 items-center justify-end rounded-full bg-black pr-1.5">
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
                  <div className="flex h-[18.5rem] flex-col justify-end px-3 pb-2 font-mono text-[10px] leading-5 [mask-image:linear-gradient(to_right,#000_84%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_84%,transparent)]">
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

        <div className="mt-10 text-center">
          <a
            href={MOBILE_PATH}
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            See the iPhone companion
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
