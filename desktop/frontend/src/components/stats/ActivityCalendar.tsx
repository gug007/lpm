import { Fragment, useMemo, useState } from "react";
import type { DailyUsage } from "../../types";
import { formatTokenCount } from "../../agentUsageFormat";
import { estimateDailyCost, formatUsd } from "./statsCost";
import { calendarModel } from "./calendarModel";
import { localDate, weekdayDate, weekdayName } from "./statsDates";
import { daySessions } from "./usageFold";
import { type DayRange, inRange } from "./statsScope";

const LEVELS = [
  "var(--bg-active)",
  "color-mix(in srgb, var(--text-primary) 22%, var(--bg-active))",
  "color-mix(in srgb, var(--text-primary) 42%, var(--bg-active))",
  "color-mix(in srgb, var(--text-primary) 64%, var(--bg-active))",
  "color-mix(in srgb, var(--text-primary) 88%, var(--bg-active))",
];
const ROW_LABELS = [0, 2, 4];

function Stat({ label, value, aside }: { label: string; value: string; aside?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-base font-semibold tracking-tight tabular-nums">
        {value}
        {aside && (
          <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{aside}</span>
        )}
      </span>
    </div>
  );
}

function dayDetail(day: DailyUsage): string {
  const cost = estimateDailyCost(day.models);
  const sessions = daySessions(day);
  return [
    weekdayDate(day.date),
    `${formatTokenCount(day.totalTokens)} tokens`,
    cost > 0 ? `≈ ${formatUsd(cost)}` : "",
    sessions > 0 ? `${sessions} session${sessions === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

interface ActivityCalendarProps {
  days: DailyUsage[];
  pinned: DayRange | null;
  onPin: (range: DayRange, extend: boolean) => void;
}

export function ActivityCalendar({ days, pinned, onPin }: ActivityCalendarProps) {
  const [hovered, setHovered] = useState<DailyUsage | null>(null);
  const model = useMemo(() => calendarModel(days, localDate()), [days]);
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Stat label="Current streak" value={plural(model.streak)} />
        <Stat label="Longest streak" value={plural(model.longest)} />
        <Stat
          label="Active days"
          value={model.active.toLocaleString()}
          aside={`of ${model.span}`}
        />
        {model.busiestWeekday !== null && (
          <Stat label="Busiest weekday" value={weekdayName(model.busiestWeekday)} />
        )}
      </div>

      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `28px repeat(${model.weeks.length}, minmax(0, 1fr))`,
          gridTemplateRows: "auto repeat(7, auto)",
          gridAutoFlow: "column",
          maxWidth: 28 + model.weeks.length * 21,
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <span />
        {Array.from({ length: 7 }, (_, row) => (
          <span
            key={row}
            className="flex items-center text-[11px] leading-none text-[var(--text-muted)]"
          >
            {ROW_LABELS.includes(row) ? weekdayName(row) : ""}
          </span>
        ))}
        {model.weeks.map((week, column) => (
          <Fragment key={week[0].date}>
            <span className="h-3.5 overflow-visible whitespace-nowrap text-[11px] leading-none text-[var(--text-muted)]">
              {model.months.get(column) ?? ""}
            </span>
            {week.map((cell) =>
              cell.outside ? (
                <span key={cell.date} className="aspect-square" aria-hidden="true" />
              ) : (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={cell.day ? dayDetail(cell.day) : weekdayDate(cell.date)}
                  onMouseEnter={() => setHovered(cell.day)}
                  onFocus={() => setHovered(cell.day)}
                  onClick={(event) => onPin({ from: cell.date, to: cell.date }, event.shiftKey)}
                  className="aspect-square rounded-[3px] transition-shadow duration-[120ms] hover:ring-1 hover:ring-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
                  style={{
                    backgroundColor: LEVELS[cell.level],
                    boxShadow:
                      pinned && inRange(cell.date, pinned)
                        ? "0 0 0 1.5px var(--text-primary)"
                        : undefined,
                  }}
                />
              ),
            )}
          </Fragment>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 text-[11px] text-[var(--text-muted)]">
        <span className="min-w-0 truncate">
          {hovered
            ? dayDetail(hovered)
            : `${model.clipped ? "Last 12 months · " : ""}Shaded by tokens · click a day to focus it`}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px]">
          Less
          {LEVELS.map((color) => (
            <span
              key={color}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: color }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
