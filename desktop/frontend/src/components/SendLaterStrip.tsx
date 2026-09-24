import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../hooks/useNow";
import { promptPreview } from "../sendLater/preview";
import { promptStatus, strongestTone, type PromptTone } from "../sendLater/status";
import { layoutStrip, type StripGroup } from "../sendLater/stripLayout";
import { shortWhenLabel } from "../sendLater/time";
import { buildScale } from "../sendLater/timeline";
import { useSendLater } from "../store/sendLater";
import { TONE_TEXT } from "../sendLater/toneStyles";
import { SendLaterCard } from "./SendLaterCard";

const DOT: Record<PromptTone, string> = {
  scheduled: "bg-[var(--accent-blue)]",
  waiting: "bg-[var(--accent-amber)]",
  missed: "border border-[var(--composer-fg-muted)] bg-transparent",
};

// Space the dot and the gap before a label take from a group's room.
const DOT_ROOM = 18;

// The prompts waiting to go into this terminal, laid along the same stretch as
// the Send later line: now at the left, tomorrow morning at the right. Each dot
// opens a card to send it now, change it or cancel it.
export function SendLaterStrip({ historyKey }: { historyKey: string }) {
  const all = useSendLater((s) => s.items);
  const holds = useSendLater((s) => s.holds);
  const items = useMemo(() => all.filter((i) => i.historyKey === historyKey), [all, historyKey]);
  const any = items.length > 0;
  const now = useNow(any, 30_000);
  const lineRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState<{ ids: string[]; rect: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [any]);

  const scale = useMemo(() => buildScale(now), [now]);
  const groups = useMemo(() => (width > 0 ? layoutStrip(items, scale, width) : []), [items, scale, width]);
  const openItems = open ? items.filter((i) => open.ids.includes(i.id)) : [];

  if (!any) return null;

  const labelOf = (group: StripGroup, first: boolean) => {
    const lead = group.items[0];
    const status = promptStatus(lead, holds[lead.id], now);
    const more = group.items.length > 1 ? ` +${group.items.length - 1}` : "";
    const when = first || lead.state !== "scheduled" ? status.title : shortWhenLabel(lead.dueAt, now);
    const words = status.tone === "scheduled" && !group.pinned ? promptPreview(lead.text, 60) : "";
    return { when: `${when}${more}`, words, tone: strongestTone(group.items.map((i) => promptStatus(i, holds[i.id], now).tone)) ?? "scheduled" };
  };

  return (
    <div className="flex items-center gap-2 px-3.5 pb-0.5 pt-0.5 text-[10.5px] leading-none">
      <span className="shrink-0 text-[var(--composer-fg-muted)]">Now</span>
      <div ref={lineRef} className="relative h-5 min-w-0 flex-1">
        <span aria-hidden className="absolute left-0 right-0 top-1/2 h-px bg-[var(--composer-border)]" />
        {groups.map((group, i) => {
          const label = labelOf(group, i === 0);
          const maxLabel = Math.max(0, group.room - DOT_ROOM);
          const ids = group.items.map((it) => it.id);
          return (
            <button
              key={ids.join(" ")}
              type="button"
              data-send-later-dot
              onClick={(e) =>
                setOpen(open && open.ids[0] === ids[0] ? null : { ids, rect: e.currentTarget.getBoundingClientRect() })
              }
              title={group.items.map((it) => promptPreview(it.text, 80)).join("\n")}
              className={`absolute top-0 flex h-5 items-center gap-1.5 rounded-md px-1 outline-none transition-colors hover:bg-[var(--composer-hover-bg)] focus-visible:bg-[var(--composer-hover-bg)] ${
                group.pinned ? "-translate-x-full flex-row-reverse" : "-translate-x-1"
              }`}
              style={{ left: `${group.x * 100}%` }}
            >
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[label.tone]}`} />
              {(maxLabel > 24 || group.pinned) && (
                <span
                  className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap"
                  style={group.pinned ? undefined : { maxWidth: maxLabel }}
                >
                  <span className={`shrink-0 tabular-nums ${TONE_TEXT[label.tone]}`}>{label.when}</span>
                  {label.words && <span className="truncate text-[var(--composer-fg-muted)]">{label.words}</span>}
                  <span className="shrink-0 text-[var(--composer-fg-muted)]">›</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {open && openItems.length > 0 && (
        <SendLaterCard
          items={openItems}
          anchor={open.rect}
          fromHistoryKey={historyKey}
          now={now}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
