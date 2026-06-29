import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useSettingsStore } from "../store/settings";
import { APP_TIPS, shuffledTips } from "./appTips";
import { renderSegments } from "./KeyCombo";
import { AppTipsModal } from "./AppTipsModal";

const ROTATE_MS = 9000;

const DEV = import.meta.env.DEV;

export function AppTip({ hasCli = true }: { hasCli?: boolean }) {
  const dismissed = useSettingsStore((s) => s.appTipsDismissed ?? false);

  const tips = useMemo(() => {
    const seed = Math.floor(Math.random() * 0x7fffffff) || 1;
    return shuffledTips(APP_TIPS, seed).filter((t) => hasCli || !t.requiresCli);
  }, [hasCli]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fits, setFits] = useState(true);
  const [showAll, setShowAll] = useState(false);
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

  return (
    <>
      <div ref={slotRef} className="min-w-0 flex-1 overflow-hidden">
        <div
          ref={contentRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className={`flex h-6 w-fit items-center gap-2 select-none transition-opacity duration-200 ${
            fits ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {DEV ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              aria-label="Show all tips"
              title="Show all tips"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--accent-amber)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <Lightbulb className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[var(--accent-amber)]" />
          )}
          <span
            key={tip.id}
            className="app-tip-in flex items-center gap-1 whitespace-nowrap text-[12px] text-[var(--text-secondary)]"
          >
            {renderSegments(tip.segments)}
          </span>
        </div>
      </div>
      {DEV && <AppTipsModal open={showAll} onClose={() => setShowAll(false)} />}
    </>
  );
}
