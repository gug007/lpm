"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Check, MoreVertical, Plus, Server } from "lucide-react";
import { useInView } from "@/components/config/playground/hooks";

const TARGET = "user@build-server";

const CHECKS = [
  "Reached build-server over SSH",
  "Installed lpm on the server",
  "Paired with a one-time invite",
  "Forwarded its port over SSH",
];

type Step = "idle" | "typing" | "installing" | "connecting" | "connected";

const MUTED = "text-[#8a8a8a]";
const PRIMARY = "text-[#ededed]";
const BORDER = "border-[#2e2e2e]";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(REDUCED_QUERY);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

function useAddHostSequence(active: boolean) {
  const [step, setStep] = useState<Step>("idle");
  const [typed, setTyped] = useState("");
  const [checks, setChecks] = useState(0);
  const reduced = useReducedMotion();

  // The reduced-motion view is derived, never written: writing it from an
  // effect would cascade a render and trip react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!active || reduced) return;
    if (step === "idle") {
      const t = setTimeout(() => setStep("typing"), 900);
      return () => clearTimeout(t);
    }
    if (step === "typing") {
      if (typed.length < TARGET.length) {
        const t = setTimeout(
          () => setTyped(TARGET.slice(0, typed.length + 1)),
          58,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setStep("installing"), 620);
      return () => clearTimeout(t);
    }
    if (step === "installing") {
      if (checks < CHECKS.length) {
        const t = setTimeout(() => setChecks((c) => c + 1), 900);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setStep("connecting"), 500);
      return () => clearTimeout(t);
    }
    if (step === "connecting") {
      const t = setTimeout(() => setStep("connected"), 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTyped("");
      setChecks(0);
      setStep("idle");
    }, 5200);
    return () => clearTimeout(t);
  }, [active, reduced, step, typed, checks]);

  if (reduced) {
    return {
      step: "connected" as Step,
      typed: TARGET,
      checks: CHECKS.length,
      reduced,
    };
  }
  return { step, typed, checks, reduced };
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
        on ? "bg-[#4ade80]" : "bg-[#3a3a3a]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-300 ${
          on ? "left-[19px]" : "left-[2px]"
        }`}
      />
    </span>
  );
}

function HostRow({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-3 border-b ${BORDER} px-4 py-3.5`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-500"
        style={{
          backgroundColor: connected
            ? "rgba(74, 222, 128, 0.15)"
            : "rgba(255,255,255,0.05)",
          color: connected ? "#4ade80" : "#8a8a8a",
        }}
      >
        <Server size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${PRIMARY}`}>
          build-server
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500"
            style={{ backgroundColor: connected ? "#4ade80" : "#fbbf24" }}
          />
          <span className={`truncate ${MUTED}`}>
            {connected
              ? "Connected"
              : `Connecting over SSH to ${TARGET}…`}
          </span>
        </span>
      </span>
      <MoreVertical size={16} className={`shrink-0 ${MUTED}`} aria-hidden />
      {/* The toggle follows "connect to this host", which is on from the moment
          it is added — the dot and the icon tint are what track liveness. */}
      <Toggle on />
    </div>
  );
}

export default function AddHostDemo() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { step, typed, checks, reduced } = useAddHostSequence(inView);

  const showRow = step === "connecting" || step === "connected";
  const busy = step === "installing";

  return (
    <section className="pb-4 sm:pb-8">
      <div ref={ref} className="max-w-3xl mx-auto px-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#161616] p-5 shadow-2xl shadow-gray-200/60 sm:p-7 dark:border-[#2e2e2e] dark:shadow-black/40">
          <p
            className={`mb-3 text-[11px] font-medium uppercase tracking-[0.15em] ${MUTED}`}
          >
            Linux hosts you connect to
          </p>

          {/* The form never unmounts, so the only height the card can gain is
              the host row. Reserving it here — and letting the card sit at the
              bottom — turns the wait into plain spacing instead of a hole, and
              keeps the page below from jumping. */}
          <div className="flex flex-col justify-end sm:min-h-[200px]">
            <div className={`overflow-hidden rounded-xl border ${BORDER}`}>
              {showRow && <HostRow connected={step === "connected"} />}

              <div className="flex items-center gap-3 px-4 py-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed ${BORDER} ${MUTED}`}
                >
                  <Plus size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${PRIMARY}`}>
                    Add a Linux host
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[12px] ${MUTED}`}
                  >
                    Type what you&rsquo;d type after ssh — lpm installs and
                    pairs itself there.
                  </span>
                </span>
              </div>

              <div
                className={`flex flex-wrap items-center gap-2 border-t ${BORDER} px-4 py-3`}
              >
                <span
                  className={`flex min-w-0 flex-1 items-center rounded-lg border ${BORDER} bg-[#1e1e1e] px-3 py-1.5 font-mono text-[13px] ${PRIMARY}`}
                >
                  <span className="truncate">{typed || " "}</span>
                  {step === "typing" && (
                    <span className="animate-caret-blink ml-px inline-block h-[15px] w-[1.5px] bg-[#ededed] align-middle" />
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-300 ${
                    busy
                      ? "bg-[#2a2a2a] text-[#8a8a8a]"
                      : "bg-[#22d3ee] text-[#0b1a1d]"
                  }`}
                >
                  {busy ? "Connecting…" : "Connect"}
                </span>
              </div>

              {busy && (
                <div className={`border-t ${BORDER} px-4 py-3`}>
                  <p className={`text-[12px] ${MUTED}`}>
                    Setting up build-server. Installing can take a few minutes.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Outside the card on purpose: the pane above mirrors the real
              Settings screen, and lpm does not report per-step progress. This
              is the page explaining the steps, not the app showing them. */}
          <div className={`mt-5 border-t ${BORDER} pt-4`}>
            <p className={`text-[11px] uppercase tracking-[0.15em] ${MUTED}`}>
              What lpm does with that one line
            </p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {CHECKS.map((label, index) => {
                const done = index < checks;
                return (
                  <li
                    key={label}
                    className="flex items-center gap-2 text-[12px]"
                  >
                    {done ? (
                      <Check
                        size={12}
                        className="shrink-0 text-[#4ade80]"
                        aria-hidden
                      />
                    ) : (
                      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#3a3a3a]" />
                    )}
                    <span className={done ? PRIMARY : MUTED}>{label}</span>
                  </li>
                );
              })}
            </ul>
            <p className={`mt-4 text-[12px] leading-relaxed ${MUTED}`}>
              {reduced
                ? "Settings → Connections in lpm on your Mac: a Linux server added over SSH, connected and running the current release."
                : "Settings → Connections in lpm on your Mac. One field, and lpm does the install, the pairing, and the tunnel."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
