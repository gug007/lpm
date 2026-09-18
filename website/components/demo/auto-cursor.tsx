"use client";

import { useLayoutEffect, useRef } from "react";
import { MousePointer2 } from "lucide-react";
import { travelDurationMs, travelKeyframes, type Point } from "./natural";

export type AutoCursorState =
  | { phase: "hidden" }
  // On its way somewhere: withinMs is how long it has before the click lands
  // there, and the seed keeps the same bend in the path on every visit.
  | { phase: "travel"; x: number; y: number; withinMs: number; seed: string }
  | { phase: "tap"; x: number; y: number }
  | { phase: "fade"; x: number; y: number };

const FADE_IN_MS = 240;
const FADE_OUT_MS = 400;
// A tap on a control that has shifted since the cursor set off for it.
const NUDGE_MS = 140;

const translate = (p: Point) => `translate3d(${p.x}px, ${p.y}px, 0)`;

// The mimed visitor's pointer. Every reach is played on the node itself, so a
// frame-by-frame move never re-renders the window it is moving over.
export function AutoCursor({ state }: { state: AutoCursorState }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<SVGSVGElement | null>(null);
  const travelRef = useRef<Animation | null>(null);
  // Where the cursor was last put down; null until it has appeared.
  const posRef = useRef<Point | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || state.phase === "hidden") {
      posRef.current = null;
      travelRef.current = null;
      return;
    }
    const target = { x: state.x, y: state.y };
    const settle = (p: Point) => {
      travelRef.current?.cancel();
      travelRef.current = null;
      el.style.transform = translate(p);
      posRef.current = p;
    };
    // Where it is right now, mid-reach included.
    const current = (): Point => {
      if (travelRef.current) {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { x: m.m41, y: m.m42 };
      }
      return posRef.current ?? target;
    };
    const move = (frames: Keyframe[], duration: number, easing: string) => {
      travelRef.current?.cancel();
      const anim = el.animate(frames, { duration, easing, fill: "forwards" });
      travelRef.current = anim;
      anim.onfinish = () => {
        if (travelRef.current === anim) settle(target);
      };
    };

    if (state.phase === "travel") {
      if (!posRef.current) {
        // First appearance: in place, fading in as it sets off.
        settle(target);
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FADE_IN_MS,
          easing: "ease-out",
        });
        return;
      }
      const from = current();
      const dist = Math.hypot(target.x - from.x, target.y - from.y);
      move(
        travelKeyframes(from, target, state.seed),
        travelDurationMs(dist, state.withinMs),
        "linear",
      );
      return;
    }

    if (state.phase === "tap") {
      const from = current();
      if (Math.hypot(target.x - from.x, target.y - from.y) > 1) {
        move(
          [{ transform: translate(from) }, { transform: translate(target) }],
          NUDGE_MS,
          "ease-out",
        );
      } else {
        settle(target);
      }
      // The press itself: a dip of the pointer under the finger.
      iconRef.current?.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.86)", offset: 0.4 },
          { transform: "scale(1)" },
        ],
        { duration: 160, easing: "ease-out" },
      );
      return;
    }

    el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_OUT_MS,
      easing: "ease-out",
      fill: "forwards",
    });
  }, [state]);

  if (state.phase === "hidden") return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[90]"
    >
      <div className="relative">
        {state.phase === "tap" && (
          <span className="auto-cursor-tap absolute -left-2 -top-2 h-9 w-9 rounded-full border-2 border-[#60a5fa]/70 bg-[#60a5fa]/20" />
        )}
        <MousePointer2
          ref={iconRef}
          className="relative h-5 w-5 text-[#e5e5e5] drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]"
          style={{ transformOrigin: "3px 4px" }}
          strokeWidth={1.75}
          fill="#e5e5e5"
        />
      </div>
    </div>
  );
}
