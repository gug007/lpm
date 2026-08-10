import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "../store/settings";
import { useTTSStore } from "../store/tts";
import { formatSpeed, TTSSpeedSlider } from "./TTSSpeedSlider";

const MENU_WIDTH = 208;
const MENU_HEIGHT = 96;

/**
 * The reading speed, changeable while a reading is in progress. Shares the
 * Settings value, so what is picked here is also where the next reading starts.
 *
 * Changing speed re-synthesizes from the current sentence, which is not
 * instant — the trigger pulses until the voice comes back, otherwise the pause
 * reads as the reading having broken.
 *
 * Callers own the trigger's look (it sits on a dark bar in one place and on the
 * page in another) and can style the open state through `data-open`.
 */
export function TTSSpeedMenu({ className = "" }: { className?: string }) {
  const speed = useSettingsStore((s) => (s.ttsSpeed && s.ttsSpeed > 0 ? s.ttsSpeed : 1));
  const applying = useTTSStore((s) => s.status === "loading");
  const setSpeed = useTTSStore((s) => s.setSpeed);
  const [open, setOpen] = useState(false);
  // What the knob currently reads, which leads the saved value during a drag.
  const [live, setLive] = useState<number | null>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    flipped: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setLive(null);
      return;
    }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Anchored to the trigger's near edge rather than to a measured height,
      // so the estimate only decides which way it opens, never the gap.
      const flipped = window.innerHeight - r.bottom - 12 < MENU_HEIGHT;
      setPos({
        top: flipped ? undefined : r.bottom + 6,
        bottom: flipped ? window.innerHeight - r.top + 6 : undefined,
        left: Math.max(12, Math.min(r.left - 10, window.innerWidth - MENU_WIDTH - 12)),
        flipped,
      });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-open={open}
        title="Reading speed"
        aria-label={`Reading speed ${formatSpeed(speed)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className} ${applying ? "speed-applying" : ""}`}
      >
        {formatSpeed(speed)}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            data-flipped={pos.flipped}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: MENU_WIDTH }}
            className="speed-menu-in fixed z-[80] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-2xl"
          >
            <div className="flex items-baseline justify-between px-1.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Reading speed
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-[var(--text-primary)]">
                {formatSpeed(live ?? speed)}
              </span>
            </div>
            <TTSSpeedSlider value={speed} onChange={setSpeed} onDraft={setLive} />
          </div>,
          document.body,
        )}
    </>
  );
}
