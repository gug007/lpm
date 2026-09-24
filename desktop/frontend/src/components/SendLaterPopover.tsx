import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Clock3, Gauge, Sun } from "lucide-react";
import type { SendLaterPicker } from "../hooks/useComposerSendLater";
import { useLimitReset } from "../hooks/useLimitReset";
import { useNow } from "../hooks/useNow";
import { useOverlay } from "../store/overlay";
import { clockChoice, type LastChoice } from "../sendLater/lastChoice";
import type { LimitAgent } from "../sendLater/limitReset";
import { promptPreview } from "../sendLater/preview";
import { MINUTE, clockLabel, dayLabel, scheduleButtonLabel, shortWhenLabel } from "../sendLater/time";
import { MIN_DELAY, buildScale, dayMarks, snapTime } from "../sendLater/timeline";
import type { ScheduledPromptKind } from "../store/sendLater";
import { SendLaterDatePanel } from "./SendLaterDatePanel";
import { SendLaterFooterButton as FooterButton } from "./SendLaterFooterButton";
import { SendLaterReadback } from "./SendLaterReadback";
import { SendLaterTimeline, type TimelineFlag } from "./SendLaterTimeline";

interface SendLaterPopoverProps {
  // The prompt box it hangs above, right-aligned with it.
  anchorRef: RefObject<HTMLElement | null>;
  picker: SendLaterPicker;
  projectName: string;
  agent: LimitAgent | null;
  onPick: (at: number, kind: ScheduledPromptKind, choice: LastChoice | null) => void;
  // Whether focus should go back to the input: yes for Escape, no for a click
  // somewhere else, which already put focus where the user wanted it.
  onClose: (refocus: boolean) => void;
}

const MAX_WIDTH = 480;
const GAP = 8;
const NUDGE = 30 * MINUTE;
const ICON = { size: 11, strokeWidth: 1.75 } as const;

// Choosing when a prompt goes out: a readback of the moment on top, the line
// from now to tomorrow morning with its flags, and the button that names it.
export function SendLaterPopover({ anchorRef, picker, projectName, agent, onPick, onClose }: SendLaterPopoverProps) {
  const now = useNow(true, 30_000);
  const scale = useMemo(() => buildScale(now), [now]);
  const earliest = now + MIN_DELAY;
  const [value, setValue] = useState(() => Math.max(picker.initialAt, Date.now() + MIN_DELAY));
  const [choice, setChoice] = useState<LastChoice | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [panel, setPanel] = useState<"line" | "date">(() =>
    picker.initialAt > buildScale(Date.now()).end ? "date" : "line",
  );
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const limit = useLimitReset(projectName, agent, now);
  useOverlay();
  const shown = preview ?? value;
  const ready = value >= earliest;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(MAX_WIDTH, r.width, window.innerWidth - 16);
      setStyle({
        position: "fixed",
        width,
        left: r.right - width,
        bottom: window.innerHeight - r.top + GAP,
        maxHeight: Math.max(160, r.top - GAP - 8),
      });
    };
    place();
    const ro = new ResizeObserver(place);
    if (anchor) ro.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose(false);
    };
    // Captured, so Escape closes the picker wherever focus is; the typed-time
    // field takes its own Escape first, to leave the field.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (document.activeElement as HTMLElement | null)?.id === "send-later-when") return;
      e.preventDefault();
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

  const focusLine = () => rootRef.current?.querySelector<HTMLElement>("[role=slider]")?.focus();
  const placed = style !== null;
  useEffect(() => {
    if (placed && panel === "line") focusLine();
  }, [placed, panel]);

  const marks = useMemo(() => dayMarks(now, scale), [now, scale]);
  const flags = useMemo(() => {
    const list: (TimelineFlag & { kind: ScheduledPromptKind })[] = [];
    if (marks.evening !== null) {
      list.push({ key: "evening", t: marks.evening, label: clockLabel(marks.evening), icon: <Clock3 {...ICON} />, title: "End of the working day", kind: "time" });
    }
    if (limit && limit.at <= scale.end && limit.at > earliest) {
      list.push({
        key: "limit",
        t: limit.at,
        label: `Limit resets ${clockLabel(limit.resetsAt)}`,
        icon: <Gauge {...ICON} />,
        title: `${limit.agent}'s ${limit.window} limit is ${Math.round(limit.usedPercent)}% used`,
        kind: "limit",
      });
    }
    list.push({
      key: "morning",
      t: marks.morning,
      label: `${dayLabel(marks.morning, now)} ${clockLabel(marks.morning)}`,
      icon: <Sun {...ICON} />,
      kind: "time",
    });
    return list.filter((f) => f.t > earliest);
  }, [marks, limit, scale, now, earliest]);

  const laterLimit = limit && limit.at > scale.end ? limit : null;

  const pickFlag = (flag: TimelineFlag) => {
    const kind = flags.find((f) => f.key === flag.key)?.kind ?? "time";
    onPick(flag.t, kind, kind === "limit" ? null : clockChoice(flag.t));
  };

  const move = (at: number, next: LastChoice | null) => {
    setValue(at);
    setChoice(next);
  };

  const fromLine = (at: number) =>
    move(at, at <= scale.nearEnd ? { kind: "delay", ms: at - scale.start } : clockChoice(at));

  const nudge = (dir: 1 | -1) => {
    const at = Math.max(earliest, value + dir * NUDGE);
    move(at <= scale.nearEnd ? snapTime(scale, at) : at, at <= scale.nearEnd ? { kind: "delay", ms: at - now } : clockChoice(at));
  };

  const commit = () => {
    if (value < Date.now() + MIN_DELAY) return;
    onPick(value, "time", choice);
  };

  if (!style) return null;
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Send later"
      style={style}
      className="menu-pop z-[80] flex flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 pb-3 pt-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
    >
      {picker.mode === "reschedule" && (
        <div className="truncate text-[11px] text-[var(--text-muted)]">
          New time for “{promptPreview(picker.item.text, 70)}”
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <SendLaterReadback
          at={shown}
          now={now}
          limitAt={limit && limit.at > earliest ? limit.at : null}
          onDone={focusLine}
          onTyped={(at, delay, isLimit) => {
            if (isLimit) {
              onPick(at, "limit", null);
              return;
            }
            move(at, delay ? { kind: "delay", ms: at - Date.now() } : clockChoice(at));
            if (at > scale.end) setPanel("date");
          }}
        />
        <span className="shrink-0 pt-1 text-right text-[10.5px] leading-snug text-[var(--text-muted)]">
          {panel === "line" ? "Click a flag to schedule, or drag the dot" : "Any day and time"}
        </span>
      </div>

      {panel === "line" ? (
        <SendLaterTimeline
          scale={scale}
          value={Math.min(value, scale.end)}
          lastUsedAt={picker.lastUsedAt}
          flags={flags}
          onChange={fromLine}
          onPreview={setPreview}
          onPickFlag={pickFlag}
          onCommit={commit}
        />
      ) : (
        <SendLaterDatePanel
          value={value}
          onChange={(at) => move(at, clockChoice(at))}
          onBack={() => {
            setPanel("line");
            if (value > scale.end) move(snapTime(scale, scale.end), clockChoice(scale.end));
          }}
          onCommit={commit}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2.5">
        {panel === "line" && (
          <>
            <FooterButton onClick={() => nudge(-1)} disabled={value - NUDGE < earliest}>
              − 30m
            </FooterButton>
            <FooterButton onClick={() => nudge(1)}>+ 30m</FooterButton>
            <FooterButton onClick={() => setPanel("date")}>
              <CalendarClock size={12} strokeWidth={1.75} />
              Another day or time…
            </FooterButton>
          </>
        )}
        {laterLimit && (
          <FooterButton onClick={() => onPick(laterLimit.at, "limit", null)} title={`${laterLimit.agent}'s ${laterLimit.window} limit is ${Math.round(laterLimit.usedPercent)}% used`}>
            <Gauge size={12} strokeWidth={1.75} />
            Limit resets {shortWhenLabel(laterLimit.resetsAt, now)}
          </FooterButton>
        )}
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={commit}
          disabled={!ready}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent-blue)] px-3 text-[12px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {ready ? scheduleButtonLabel(value, now) : `Pick a time at least ${MIN_DELAY / MINUTE} min ahead`}
          {ready && <span className="text-[11px] opacity-70">↵</span>}
        </button>
      </div>
    </div>,
    document.body,
  );
}
