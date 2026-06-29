import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, ChevronRight, X } from "lucide-react";
import { useSettingsStore, saveSettings } from "../store/settings";
import { APP_TIPS, shuffledTips, type TipSegment } from "./appTips";

const ROTATE_MS = 9000;

function Kbd({ label }: { label: string }) {
  return (
    <kbd className="inline-flex h-[15px] items-center rounded border border-[var(--border)] bg-[var(--bg-active)] px-1 font-mono text-[9px] leading-none text-[var(--text-secondary)]">
      {label}
    </kbd>
  );
}

function renderSegments(segments: TipSegment[]) {
  return segments.map((seg, i) =>
    typeof seg === "string" ? (
      <span key={i}>{seg}</span>
    ) : (
      <Kbd key={i} label={seg.kbd} />
    ),
  );
}

export function AppTip({ hasCli = true }: { hasCli?: boolean }) {
  const dismissed = useSettingsStore((s) => s.appTipsDismissed ?? false);

  const tips = useMemo(() => {
    const seed = Math.floor(Math.random() * 0x7fffffff) || 1;
    return shuffledTips(APP_TIPS, seed).filter((t) => hasCli || !t.requiresCli);
  }, [hasCli]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fits, setFits] = useState(true);
  const slotRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || tips.length <= 1) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % tips.length),
      ROTATE_MS,
    );
    return () => clearTimeout(id);
  }, [paused, tips.length, index]);

  // The footer hands the tip whatever width is left after the action buttons.
  // Show it only when the current tip's natural width fits that slot, so a tip
  // never gets clipped mid-word — a longer one is simply skipped until a
  // shorter one rotates in or the pane widens.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const content = contentRef.current;
    if (!slot || !content) return;
    const measure = () => setFits(content.offsetWidth <= slot.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [index, tips.length, dismissed]);

  if (dismissed || tips.length === 0) return null;

  const tip = tips[index % tips.length];
  const next = () => setIndex((i) => (i + 1) % tips.length);

  return (
    <div ref={slotRef} className="min-w-0 flex-1 overflow-hidden">
      <div
        ref={contentRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className={`group flex h-6 w-fit items-center gap-2 select-none transition-opacity duration-200 ${
          fits ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Lightbulb className="h-3 w-3 shrink-0 text-[var(--accent-amber)]" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Tip
        </span>
        <span
          key={tip.id}
          className="app-tip-in flex items-center gap-1 whitespace-nowrap text-[11px] text-[var(--text-secondary)]"
        >
          {renderSegments(tip.segments)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={next}
            aria-label="Next tip"
            title="Next tip"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void saveSettings({ appTipsDismissed: true })}
            aria-label="Hide tips"
            title="Hide tips"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
