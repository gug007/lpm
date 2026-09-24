"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { AutoCursorState } from "./auto-cursor";
import { pointOn } from "./tour-kit";
import type { Tour, TourHandle, TourHint, TourState } from "./tour";
import {
  tourStepMoves,
  type TourContext,
  type TourMove,
  type TourPerformers,
} from "./tour-moves";
import {
  bindTour,
  openingBootIndex,
  reachedStage,
  type TourSnapshot,
} from "./tour-progress";

// How long before the tour presses Start its ring starts pulsing.
const RING_LEAD_MS = 1700;
// Having clicked into a field, a hand moves the pointer off the text it is
// about to type: this long after the click, and this far.
const ASIDE_DELAY_MS = 350;
const ASIDE_OFFSET = { x: 44, y: 16 };

type Args = {
  tour: Tour;
  tourRef?: React.Ref<TourHandle>;
  onTour?: (state: TourState) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  // Parked is what the tour waits for, so nobody spends the whole performance
  // on it below the fold.
  isParked: boolean;
  snapshot: TourSnapshot;
  performers: TourPerformers;
  startButtonRef: RefObject<HTMLButtonElement | null>;
  agentButtonRef: RefObject<HTMLButtonElement | null>;
  codexButtonRef: RefObject<HTMLButtonElement | null>;
  // A step that has happened swaps the pill's line for its own; one with
  // nothing to say retires the opening line once the tour is under way.
  onHint: (hint: TourHint) => void;
  onHintDone: () => void;
  // The visitor took the wheel: the frame drops its prompts.
  onInteract: () => void;
};

// Plays a page's tour in the frame with a mimed cursor pressing the real
// controls, counts the steps that have happened whoever did them, and lets a
// step clicked in the list run the window up to it.
export function useDemoTour({
  tour,
  tourRef,
  onTour,
  containerRef,
  isParked,
  snapshot,
  performers,
  startButtonRef,
  agentButtonRef,
  codexButtonRef,
  onHint,
  onHintDone,
  onInteract,
}: Args) {
  const [autoCursor, setAutoCursor] = useState<AutoCursorState>({
    phase: "hidden",
  });
  const [ringPulseOn, setRingPulseOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Read by the moves at the moment of each click, which is long after the
  // effect that armed them last ran.
  const liveRef = useRef(snapshot);
  const performersRef = useRef(performers);
  const hooksRef = useRef({ onHint, onHintDone, onInteract });
  // Read when the tour arms rather than on every render: a page hands the same
  // tour in for the life of the frame, and re-arming on it would end the tour.
  const tourConfigRef = useRef(tour);
  // How many steps have counted, read by the step list and by a step clicked
  // in it. A step counts once every step before it has, and stays counted: a
  // later step undoing its state is not unlearning it. Advanced while
  // rendering, so the list never lags the window by a render.
  const [opening] = useState(snapshot.selected);
  const bindings = useMemo(
    () => bindTour(tour.steps, opening),
    [tour, opening],
  );
  const bindingsRef = useRef(bindings);
  const [stage, setStage] = useState(0);
  const reached = reachedStage(tour.steps, bindings, stage, snapshot);
  if (reached !== stage) setStage(reached);
  const armedRef = useRef(false);
  // Lets a step clicked in the list stop the mimed tour mid-flight, so the
  // click it was about to land does not double the visitor's.
  const cancelRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const memosRef = useRef<Map<string, unknown>[]>([]);
  // Once any step has put its own line in the pill, the pill is theirs.
  const stepHintShownRef = useRef(false);

  useLayoutEffect(() => {
    liveRef.current = snapshot;
    performersRef.current = performers;
    hooksRef.current = { onHint, onHintDone, onInteract };
    tourConfigRef.current = tour;
    bindingsRef.current = bindings;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onTour?.({ stage, playing });
  }, [onTour, stage, playing]);

  const context = useCallback(
    (
      container: HTMLElement,
      index: number,
      onWait: (cancel: () => void) => void,
    ): TourContext => ({
      container,
      bound: bindingsRef.current[index] ?? { visit: 1 },
      memo: (memosRef.current[index] ??= new Map()),
      snapshot: () => liveRef.current,
      startButton: () => startButtonRef.current,
      chip: (agent) =>
        agent === "claude" ? agentButtonRef.current : codexButtonRef.current,
      perform: {
        addProject: (input) => performersRef.current.addProject(input),
        selectProject: (name) => performersRef.current.selectProject(name),
        showProject: (name) => performersRef.current.showProject(name),
        visitProject: (name) => performersRef.current.visitProject(name),
        openAgent: (project, agent) =>
          performersRef.current.openAgent(project, agent),
        copy: (project, mode) => performersRef.current.copy(project, mode),
        openReview: () => performersRef.current.openReview(),
        checkout: (branch) => performersRef.current.checkout(branch),
        commit: () => performersRef.current.commit(),
        recordAction: (action) => performersRef.current.recordAction(action),
      },
      onWait,
      onStepDone: () => {
        const hint = tourConfigRef.current.steps[index]?.hint;
        if (hint) {
          stepHintShownRef.current = true;
          hooksRef.current.onHint(hint);
        } else if (index > 0 && !stepHintShownRef.current) {
          hooksRef.current.onHintDone();
        }
      },
    }),
    [startButtonRef, agentButtonRef, codexButtonRef],
  );

  useEffect(() => {
    if (!isParked || armedRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    // Nothing to tour without a project on screen.
    if (!startButtonRef.current) return;
    armedRef.current = true;

    const { steps } = tourConfigRef.current;
    let driveWaits: (() => void)[] = [];
    const onWait = (cancel: () => void) => driveWaits.push(cancel);
    // The mimed cursor clicks real buttons, and each step presses its control
    // at most once — the moves keep that count between the mime and a landing.
    const plan = steps.map((step, index) => ({
      step,
      ...tourStepMoves(step, context(container, index, onWait)),
    }));
    // The step that boots the project the frame opens on, if any.
    const bootEntry = plan[openingBootIndex(steps)];

    // What the sequence was heading for, landed at once: a visitor who scrolls
    // away or has motion turned down comes back to a finished demo rather than
    // a project half set up.
    const landRemaining = () => {
      for (const entry of plan) entry.land({ quiet: true });
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      // Outside the effect: a landing renders before it returns, which React
      // cannot do from inside a commit.
      window.setTimeout(() => {
        if (mountedRef.current) landRemaining();
      }, 0);
      return;
    }

    let cancelled = false;
    let cursorHidden = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
      for (const cancel of driveWaits) cancel();
      driveWaits = [];
    };

    const hideCursor = () => {
      if (cursorHidden) return;
      cursorHidden = true;
      setAutoCursor({ phase: "hidden" });
      setRingPulseOn(false);
    };

    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimers();
      hideCursor();
      setPlaying(false);
    };
    cancelRef.current = cancel;

    // Moving the pointer means the visitor is taking over: drop the mimed
    // cursor, but still boot the project so the demo never sits empty. A click
    // lands the boot too — synchronously, so it is still the opening project's
    // Start button being pressed rather than whichever row the click is about
    // to select.
    const onPointerMove = () => hideCursor();
    // The chevron beside Start and the menu it opens: pressing either only
    // opens or uses that menu, so the boot is neither wanted here nor spent —
    // a later click elsewhere still lands it.
    const inStartMenu = (node: Node) =>
      !!startButtonRef.current?.parentElement?.contains(node) ||
      (node instanceof Element && !!node.closest('[role="menu"]'));
    // Pressing Start IS the boot, so it latches the step rather than injecting
    // a click: the browser delivers pointerdown and click in separate tasks, so
    // a click here would flip the button to Stop before the visitor's own click
    // lands on it and shut the project straight back down.
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      // A visitor who has already moved to another project by keyboard is not
      // sent back to boot the one the frame opened on.
      if (liveRef.current.selected !== opening) bootEntry?.latch();
      else if (node && startButtonRef.current?.contains(node)) bootEntry?.latch();
      else if (!node || !inStartMenu(node)) bootEntry?.land({ quiet: true });
      cancel();
    };
    const onKeyDown = () => cancel();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("keydown", onKeyDown);

    const containerRect = container.getBoundingClientRect();
    const from = {
      x: containerRect.width * 0.45,
      y: containerRect.height * 0.65,
    };

    const at = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };
    at(0, () => setPlaying(true));
    // Most beats are pure cursor animation: skip them once the visitor's own
    // pointer has taken over, but let the clicks through.
    const mime = (ms: number, fn: () => void) =>
      at(ms, () => {
        if (!cursorHidden) fn();
      });
    // A control can shift as panes open, so every beat re-reads where it is.
    // One that is not on screen leaves the cursor where it was.
    const aim = (move: TourMove, phase: "travel" | "tap", seed: string) => {
      const el = move.target();
      if (!el) return null;
      const point = pointOn(container.getBoundingClientRect(), el, move, seed);
      setAutoCursor(
        phase === "travel"
          ? { phase, ...point, withinMs: move.travelMs, seed }
          : { phase, ...point },
      );
      return point;
    };

    // Start rings ahead of each click on it, wherever in the tour that comes.
    for (const entry of plan) {
      if (entry.step.id !== "start") continue;
      const startMs = entry.step.beatMs;
      mime(Math.max(0, startMs - RING_LEAD_MS), () => setRingPulseOn(true));
      mime(startMs + 300, () => setRingPulseOn(false));
    }

    // Every step waits on the one before it long enough for a visitor to watch
    // what that click did — jumping straight on buries the thing it just did.
    let entered = false;
    for (const [stepIndex, entry] of plan.entries()) {
      entry.moves.forEach((move, index) => {
        const seed = `${entry.step.id}:${stepIndex}:${index}`;
        const clickMs = entry.step.beatMs + move.offsetMs;
        const travelMs = clickMs - move.travelMs;
        if (!entered) {
          entered = true;
          mime(travelMs - 80, () =>
            setAutoCursor({ phase: "travel", ...from, withinMs: 0, seed }),
          );
        }
        mime(travelMs, () => {
          if (move.reveal?.() ?? true) aim(move, "travel", seed);
        });
        at(clickMs, () => {
          const point =
            !cursorHidden && (move.reveal?.() ?? true)
              ? aim(move, "tap", seed)
              : null;
          move.act();
          if (point && move.anchor === "start")
            mime(ASIDE_DELAY_MS, () =>
              setAutoCursor({
                phase: "travel",
                x: point.x + ASIDE_OFFSET.x,
                y: point.y + ASIDE_OFFSET.y,
                withinMs: ASIDE_DELAY_MS * 2,
                seed: `${seed}:aside`,
              }),
            );
        });
      });
    }

    // The cursor stays on the last step until it has visibly happened — for a
    // typed prompt, until the prompt has gone — then fades from wherever it
    // actually is.
    const last = plan[plan.length - 1];
    const endMs = last ? last.step.beatMs + last.tailMs() : 0;
    mime(endMs, () =>
      setAutoCursor((cur) =>
        cur.phase === "hidden" ? cur : { phase: "fade", x: cur.x, y: cur.y },
      ),
    );
    at(endMs + 500, () => {
      if (!cursorHidden) setAutoCursor({ phase: "hidden" });
      setPlaying(false);
    });

    return () => {
      // Scrolling away mid-flight would otherwise strand the mimed cursor on
      // screen and abandon the sequence half-done — the effect never re-arms,
      // so the visitor would come back to a project that never got its agent.
      // Skip the remaining animation, but land on the state it was heading
      // for: a moment later, from outside this teardown, so a step that has to
      // render before the next one can. Not for a frame that is going away.
      if (!cancelled)
        window.setTimeout(() => {
          if (mountedRef.current) landRemaining();
        }, 0);
      cancelled = true;
      clearTimers();
      hideCursor();
      cancelRef.current = null;
      setPlaying(false);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [isParked, containerRef, startButtonRef, context, opening]);

  // A step clicked in the list runs everything up to it that has not happened
  // yet, so the list never shows a later step done with an earlier one still
  // pending. Steps passed through on the way land quietly; the one clicked is
  // shown the way the tour would show it.
  useImperativeHandle(tourRef, () => ({
    run: (index: number) => {
      armedRef.current = true;
      cancelRef.current?.();
      setAutoCursor({ phase: "hidden" });
      hooksRef.current.onInteract();
      const container = containerRef.current;
      if (!container) return;
      const steps = tourConfigRef.current.steps;
      const upTo = Math.min(index, steps.length - 1);
      for (let i = 0; i <= upTo; i += 1) {
        const moves = tourStepMoves(steps[i], context(container, i, () => {}));
        if (i !== upTo && i < stage) moves.settle?.();
        else moves.land({ quiet: i !== upTo });
      }
    },
  }));

  const hideCursor = useCallback(
    () => setAutoCursor({ phase: "hidden" }),
    [],
  );

  return { autoCursor, ringPulseOn, hideCursor };
}
