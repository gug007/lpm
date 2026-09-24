import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ImageIcon } from "lucide-react";
import {
  cancelScheduled,
  editScheduled,
  keepScheduledAsDraft,
  newTimeFor,
  sendScheduledNow,
} from "../sendLater/actions";
import { promptPreview } from "../sendLater/preview";
import { promptStatus } from "../sendLater/status";
import { TONE_TEXT } from "../sendLater/toneStyles";
import { useOverlay } from "../store/overlay";
import { useSendLater, type ScheduledPrompt } from "../store/sendLater";

interface SendLaterCardProps {
  items: ScheduledPrompt[];
  anchor: DOMRect;
  // The input the card was opened from, whose picker a new time opens in.
  fromHistoryKey: string;
  now: number;
  // Closed; `refocus` when focus should go back to the dot (Escape, an action).
  onClose: (refocus: boolean) => void;
}

const WIDTH = 320;

const ACTION_CLASS =
  "h-6 rounded-md px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// The prompts behind one dot on the strip, each with what can be done to it.
export function SendLaterCard({ items, anchor, fromHistoryKey, now, onClose }: SendLaterCardProps) {
  const holds = useSendLater((s) => s.holds);
  const ref = useRef<HTMLDivElement>(null);
  useOverlay();

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target) || target.closest?.("[data-send-later-dot]")) return;
      onClose(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const act = (run: () => unknown) => () => {
    onClose(true);
    void run();
  };

  const left = Math.min(Math.max(8, anchor.left - 24), window.innerWidth - WIDTH - 8);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Scheduled prompts"
      style={{ position: "fixed", left, width: WIDTH, bottom: window.innerHeight - anchor.top + 6 }}
      className="menu-pop z-[80] flex max-h-[360px] flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
    >
      {items.map((item, i) => {
        const status = promptStatus(item, holds[item.id], now);
        const images = Object.keys(item.images).length;
        return (
          <div key={item.id} className={`flex flex-col gap-1 px-3 py-2 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
            <span className={`text-[11px] font-medium ${TONE_TEXT[status.tone]}`}>{status.title}</span>
            {status.detail && <span className="text-[10.5px] text-[var(--text-muted)]">{status.detail}</span>}
            <span className="line-clamp-2 text-[12px] leading-snug text-[var(--text-primary)]">
              {promptPreview(item.text, 160)}
            </span>
            {images > 0 && (
              <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
                <ImageIcon size={11} strokeWidth={1.75} />
                {images === 1 ? "1 image" : `${images} images`}
              </span>
            )}
            <div className="-ml-2 mt-0.5 flex items-center gap-0.5">
              <button
                type="button"
                title={item.state === "due" ? "Types it in now, as if you pressed ↵" : undefined}
                onClick={act(() => sendScheduledNow(item))}
                className={`${ACTION_CLASS} font-medium text-[var(--accent-blue-text)]`}
              >
                Send now
              </button>
              {item.state === "missed" ? (
                <>
                  <button type="button" onClick={act(() => newTimeFor(item, fromHistoryKey))} className={ACTION_CLASS}>
                    New time
                  </button>
                  <button type="button" onClick={act(() => keepScheduledAsDraft(item))} className={ACTION_CLASS}>
                    Keep as draft
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={act(() => editScheduled(item))} className={ACTION_CLASS}>
                    Edit
                  </button>
                  <button type="button" onClick={act(() => cancelScheduled(item))} className={ACTION_CLASS}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
