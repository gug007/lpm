"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

// The line's position, in percent of the stage from the left: the pile shows to
// its left and lpm to its right. At rest it sits in the strip of desk just left
// of the lpm window, the one place where it cuts through neither picture.
const REST = 47;
export const MIN = 6;
export const MAX = 94;
// The one-time sweep swings the line across lpm and back, so a visitor sees
// that something lies under it before touching anything.
const PEAK = 90;
const SWEEP_MS = 1200;
// A press on the stage becomes a drag only once it has moved this far sideways,
// so a plain click can glide the line there and a vertical swipe still scrolls.
const DRAG_SLOP = 5;
const KEY_STEP: Record<string, number> = {
  ArrowRight: 5,
  ArrowUp: 5,
  ArrowLeft: -5,
  ArrowDown: -5,
  PageUp: 10,
  PageDown: -10,
};

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Press = { id: number; x: number; y: number; knob: boolean; dragging: boolean };

export function useSplitSlider(stageRef: RefObject<HTMLDivElement | null>) {
  const [split, setSplit] = useState(REST);
  const [dragging, setDragging] = useState(false);
  const current = useRef(REST);
  const goal = useRef(REST);
  const frame = useRef(0);
  const touched = useRef(false);
  const sweeping = useRef(false);
  const press = useRef<Press | null>(null);

  function show(v: number) {
    current.current = clamp(v);
    setSplit(current.current);
  }

  function stop() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }

  function animate(ms: number, at: (k: number) => number, done?: () => void) {
    stop();
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      show(at(k));
      if (k < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = 0;
        done?.();
      }
    };
    frame.current = requestAnimationFrame(step);
  }

  function glide(to: number, ms: number) {
    const target = (goal.current = clamp(to));
    if (reducedMotion()) {
      stop();
      show(target);
      return;
    }
    const from = current.current;
    animate(ms, (k) => from + (target - from) * easeOut(k));
  }

  // Any input from the visitor ends the sweep and keeps it from ever starting.
  function take() {
    touched.current = true;
    sweeping.current = false;
    stop();
  }

  function percentAt(clientX: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? ((clientX - rect.left) / rect.width) * 100 : current.current;
  }

  function release() {
    press.current = null;
    setDragging(false);
  }

  const sweep = useEffectEvent(() => {
    if (touched.current) return;
    sweeping.current = true;
    animate(
      SWEEP_MS,
      (k) => REST + ((PEAK - REST) * (1 - Math.cos(2 * Math.PI * k))) / 2,
      () => {
        sweeping.current = false;
        show(REST);
      },
    );
  });
  const cancelFrame = useEffectEvent(stop);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion()) return;
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        timer = window.setTimeout(sweep, 400);
      },
      { threshold: 0.6 },
    );
    observer.observe(stage);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      cancelFrame();
    };
  }, [stageRef]);

  const stageHandlers = {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (e.button !== 0 || (e.target as Element).closest("button,[role=slider]")) return;
      take();
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, knob: false, dragging: false };
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const p = press.current;
      if (!p || p.knob || p.id !== e.pointerId) return;
      if (!p.dragging) {
        const dx = Math.abs(e.clientX - p.x);
        if (dx < DRAG_SLOP || dx < Math.abs(e.clientY - p.y)) return;
        p.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        window.getSelection()?.removeAllRanges();
      }
      show(percentAt(e.clientX));
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      const p = press.current;
      if (!p || p.knob || p.id !== e.pointerId) return;
      const selecting = !window.getSelection()?.isCollapsed;
      if (!p.dragging && !selecting) glide(percentAt(e.clientX), 320);
      release();
    },
    onPointerCancel() {
      if (press.current && !press.current.knob) release();
    },
  };

  const knobHandlers = {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (e.button !== 0) return;
      take();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, knob: true, dragging: true };
      setDragging(true);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const p = press.current;
      if (p?.knob && p.id === e.pointerId) show(percentAt(e.clientX));
    },
    onPointerUp: release,
    onPointerCancel: release,
    onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      const base = frame.current ? goal.current : current.current;
      const to =
        e.key === "Home" ? MIN : e.key === "End" ? MAX : e.key in KEY_STEP ? base + KEY_STEP[e.key] : null;
      if (to === null) return;
      e.preventDefault();
      take();
      glide(to, 160);
    },
    onFocus() {
      const wasSweeping = sweeping.current;
      take();
      if (wasSweeping) glide(REST, 200);
    },
  };

  function snap(to: number) {
    take();
    glide(to, 420);
  }

  return { split, dragging, stageHandlers, knobHandlers, snap };
}
