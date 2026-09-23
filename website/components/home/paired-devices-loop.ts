import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CLAUDE_LINES,
  PREAMBLE,
  REPLY_INDEX,
  REPLY_TEXT,
} from "@/components/home/paired-devices-data";

export type Owner = "mac" | "phone";
export type Tap = "notification" | "mac" | null;

type Step = { wait: number; apply: () => void };

type Frame = {
  revealed: number;
  typed: string;
  typing: boolean;
  owner: Owner;
  phoneOpen: boolean;
  notified: boolean;
  tap: Tap;
};

const START: Frame = {
  revealed: PREAMBLE,
  typed: "",
  typing: false,
  owner: "mac",
  phoneOpen: false,
  notified: false,
  tap: null,
};

// What a visitor who asked for reduced motion sees: the phone holding the
// session after the handoff, and the Mac showing where it went.
const STILL: Frame = {
  ...START,
  revealed: CLAUDE_LINES.length,
  owner: "phone",
  phoneOpen: true,
};

// One terminal is live on one screen at a time, as in the app: the agent works
// on the Mac, the phone is notified when it needs an answer, opening the
// terminal there takes control (the Mac shows "Active in iPhone"), and the Mac
// takes it back. Pausing freezes the current frame and resuming carries on from
// the same beat.
export function usePairedDevicesLoop(
  sectionRef: RefObject<HTMLElement | null>,
  paused: boolean,
) {
  const [frame, setFrame] = useState<Frame>(START);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const stepRef = useRef(0);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      // Leaving mid-sequence would otherwise freeze a half-typed frame that
      // lingers on the way back until the loop's first step clears it. A
      // paused frame is the visitor's choice, so it stays put.
      if (!entry.isIntersecting && !pausedRef.current) {
        stepRef.current = 0;
        setFrame(START);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sectionRef]);

  useEffect(() => {
    if (reduced || !inView || paused) return;

    const steps: Step[] = [];
    const set = (wait: number, patch: Partial<Frame>) =>
      steps.push({ wait, apply: () => setFrame((f) => ({ ...f, ...patch })) });

    steps.push({ wait: 450, apply: () => setFrame(START) });
    for (let i = PREAMBLE + 1; i <= REPLY_INDEX; i += 1) {
      set(i === PREAMBLE + 1 ? 720 : 620, { revealed: i });
    }
    set(700, { notified: true });
    set(1500, { tap: "notification" });
    set(320, { tap: null, notified: false, phoneOpen: true, owner: "phone" });
    set(900, { typing: true });
    for (let c = 1; c <= REPLY_TEXT.length; c += 1) {
      set(52, { typed: REPLY_TEXT.slice(0, c) });
    }
    set(560, { revealed: REPLY_INDEX + 1, typed: "", typing: false });
    for (let i = REPLY_INDEX + 2; i <= CLAUDE_LINES.length; i += 1) {
      set(i === REPLY_INDEX + 2 ? 850 : 620, { revealed: i });
    }
    set(1800, { tap: "mac" });
    set(650, { tap: null, owner: "mac" });
    steps.push({ wait: 2600, apply: () => {} });

    let idx = stepRef.current % steps.length;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const step = steps[idx];
      timer = setTimeout(() => {
        step.apply();
        idx = (idx + 1) % steps.length;
        stepRef.current = idx;
        run();
      }, step.wait);
    };
    run();
    return () => clearTimeout(timer);
  }, [reduced, inView, paused]);

  const f = reduced ? STILL : frame;
  const working =
    !reduced &&
    !f.typing &&
    f.revealed > PREAMBLE &&
    f.revealed < CLAUDE_LINES.length &&
    f.revealed !== REPLY_INDEX;

  return {
    reduced,
    visible: CLAUDE_LINES.slice(0, f.revealed),
    typed: f.typed,
    isTyping: f.typing && !reduced,
    working,
    owner: f.owner,
    phoneOpen: f.phoneOpen,
    notified: f.notified,
    tap: f.tap,
  };
}
