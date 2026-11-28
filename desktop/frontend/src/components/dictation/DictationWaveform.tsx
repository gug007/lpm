import { useEffect, useRef } from "react";
import { dictationLevel } from "../../store/dictation";

const BAR = 2.5;
const STEP = 4.5;
const DOT = 2.5;
// Room on the right for the record head the trace scrolls out of.
const HEAD = 14;
const FADE = 36;
const SAMPLE_MS = 70;
const MAX_BARS = 160;
const SWEEP_MS = 1500;
const SWEEP_HALF = 40;

interface DictationWaveformProps {
  // Transcribing: the trace stops where the recording ended and a light
  // sweeps across it while VoiceToText works.
  frozen: boolean;
  // The trace's height: a composer row's unless the host gives it more room.
  className?: string;
}

// The level trace of the recording, as if leaving a tape head: sound enters
// at the red dot and scrolls left. Silence is a dotted line; speech rises
// into bars.
export function DictationWaveform({ frozen, className = "h-7" }: DictationWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const frozenRef = useRef(frozen);
  const bars = useRef<number[]>(Array(MAX_BARS).fill(0));

  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = 0;
    let lastPush = performance.now();
    let ink = getComputedStyle(canvas).color;
    let frame = 0;

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ink = getComputedStyle(canvas).color;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const frozenNow = frozenRef.current;
      const target = frozenNow ? 0 : dictationLevel();
      // Quick to rise, slower to fall, like a VU meter.
      shown += (target - shown) * (target > shown ? 0.55 : 0.18);
      if (frozenNow) {
        lastPush = now;
      } else {
        while (now - lastPush >= SAMPLE_MS) {
          bars.current.push(shown);
          bars.current.shift();
          lastPush += SAMPLE_MS;
        }
      }
      const offset = frozenNow || still ? 0 : ((now - lastPush) / SAMPLE_MS) * STEP;

      ctx.fillStyle = ink;
      const list = bars.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const age = list.length - 1 - i;
        const x = w - HEAD - BAR - age * STEP - offset;
        if (x < -BAR) break;
        const amp = Math.min(1, list[i]);
        const bh = Math.max(DOT, amp * (h - 2));
        const edge = Math.max(0, Math.min(1, x / FADE));
        ctx.globalAlpha = (frozenNow ? 0.3 : 0.28 + 0.72 * Math.min(1, amp * 2.4)) * edge;
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, BAR, bh, BAR / 2);
        ctx.fill();
      }

      if (frozenNow && !still) {
        drawSweep(ctx, list, w, h, ((now % SWEEP_MS) / SWEEP_MS) * (w + 2 * SWEEP_HALF) - SWEEP_HALF);
      }
      ctx.globalAlpha = 1;

      const head = headRef.current;
      if (head) head.style.transform = `translateY(-50%) scale(${frozenNow ? 1 : 1 + shown * 0.9})`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full text-[var(--dictation-ink)]" />
      <span
        ref={headRef}
        aria-hidden
        data-frozen={frozen || undefined}
        className="dictation-head absolute right-1 top-1/2 h-2 w-2 rounded-full"
      />
    </div>
  );
}

// The light passing over a frozen trace: the bars under it drawn again in
// full ink, fading out toward the light's edges.
function drawSweep(ctx: CanvasRenderingContext2D, list: number[], w: number, h: number, center: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const x = w - HEAD - BAR - (list.length - 1 - i) * STEP;
    if (x < -BAR) break;
    const distance = Math.abs(x - center);
    if (distance > SWEEP_HALF) continue;
    const bh = Math.max(DOT, Math.min(1, list[i]) * (h - 2));
    const edge = Math.max(0, Math.min(1, x / FADE));
    ctx.globalAlpha = (1 - distance / SWEEP_HALF) * 0.75 * edge;
    ctx.beginPath();
    ctx.roundRect(x, (h - bh) / 2, BAR, bh, BAR / 2);
    ctx.fill();
  }
}
