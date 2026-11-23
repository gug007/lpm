import { useRef } from "react";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { WeekdayPicker } from "./WeekdayPicker";
import { RowSelect } from "./RowSelect";
import { MonthlyRows } from "./MonthlyRows";
import { IntervalRows } from "./IntervalRows";
import { TimeOfDayRows } from "./TimeOfDayRows";
import { NextRunsPreview } from "./NextRunsPreview";
import { CronScheduleEditor } from "./cron/CronScheduleEditor";
import { EventScheduleRows } from "./EventScheduleRows";
import type { CronAIContext } from "./cron/CronDescribeBox";
import { Card, GroupLabel, Row, TIME_INPUT_CLASS } from "./JobFormRows";
import type { JobDraft, ScheduleKind } from "../../../jobsFormat";
import { REPEAT_OPTIONS, repeatOf, repeatPatch } from "../../../jobsRepeat";
import { cronFormPatch, DEFAULT_CRON, formCron } from "../../../jobsCron";

const KIND_OPTIONS: { value: ScheduleKind; label: string }[] = [
  { value: "form", label: "Simple" },
  { value: "cron", label: "Cron" },
  { value: "event", label: "Event" },
];

// "1 random day a week", "2 random days a week" … up to one short of the pool,
// since picking all of them is what "all of them" already means.
function pickOptions(pool: number): { value: string; label: string }[] {
  const options = [{ value: "0", label: "All of them" }];
  for (let n = 1; n < pool; n++) {
    options.push({
      value: String(n),
      label: `${n} random day${n === 1 ? "" : "s"} a week`,
    });
  }
  return options;
}

// When the job runs: how often it repeats, which days, and — for a job that
// runs at a time of day — set times or a window the time is drawn from. Or a
// cron line, for anyone who'd rather write one, or something that happens.
export function JobFrequencyCard({
  draft,
  patch,
  problem,
  ai,
}: {
  draft: JobDraft;
  patch: (values: Partial<JobDraft>) => void;
  problem: string | null;
  ai: CronAIContext;
}) {
  // The form's cron line as of leaving the cron editor: while the form still
  // says that, coming back keeps the line as it was typed.
  const formAtLeave = useRef<string | null | undefined>(undefined);
  const repeat = repeatOf(draft);
  const atTime = draft.scheduleMode === "time";
  const byWeek = repeat === "daily" || repeat === "weekly";
  // The days a random pick draws from: the ones selected, or all seven.
  const dayPool = draft.days.length === 0 ? 7 : draft.days.length;
  const picked = draft.randomDays ? Math.min(draft.pickDays, dayPool) : 0;

  // Each switch carries the schedule across when the other side can say it.
  const setKind = (next: ScheduleKind) => {
    if (next === draft.scheduleKind) return;
    if (next === "event" || (next === "form" && draft.scheduleKind === "event")) {
      patch({ scheduleKind: next });
      return;
    }
    if (next === "form") {
      const fromCron = cronFormPatch(draft.cron) ?? {};
      formAtLeave.current = formCron({ ...draft, ...fromCron });
      patch({ ...fromCron, scheduleKind: "form" });
      return;
    }
    const fromForm = formCron(draft);
    const keep = draft.cron.trim() !== "" && formAtLeave.current === fromForm;
    patch({
      scheduleKind: "cron",
      cron: keep ? draft.cron : (fromForm ?? (draft.cron.trim() || DEFAULT_CRON)),
    });
  };

  const kindToggle = (
    <SegmentedControl
      variant="subtle"
      ariaLabel="Set the schedule with"
      value={draft.scheduleKind}
      onChange={setKind}
      options={KIND_OPTIONS}
    />
  );

  if (draft.scheduleKind === "event") {
    return (
      <div>
        <GroupLabel aside={kindToggle}>When</GroupLabel>
        <EventScheduleRows draft={draft} patch={patch} problem={problem} />
      </div>
    );
  }

  if (draft.scheduleKind === "cron") {
    return (
      <div>
        <GroupLabel aside={kindToggle}>When</GroupLabel>
        <CronScheduleEditor
          value={draft.cron}
          onChange={(cron) => patch({ cron })}
          ai={ai}
        />
      </div>
    );
  }

  return (
    <div>
      <GroupLabel aside={kindToggle}>When</GroupLabel>
      <Card>
        <Row label="Repeat">
          <SegmentedControl
            variant="subtle"
            ariaLabel="Repeat"
            value={repeat}
            onChange={(next) => patch(repeatPatch(draft, next))}
            options={REPEAT_OPTIONS}
          />
        </Row>
        {repeat === "weekly" && (
          <Row label="On" alignTop>
            <WeekdayPicker
              value={draft.days}
              onChange={(days) => patch({ days })}
            />
          </Row>
        )}
        {repeat === "monthly" && <MonthlyRows draft={draft} patch={patch} />}
        {repeat === "once" && (
          <Row label="On">
            <input
              type="date"
              aria-label="Date"
              value={draft.onceDate}
              onChange={(e) => patch({ onceDate: e.target.value })}
              className={TIME_INPUT_CLASS}
            />
          </Row>
        )}
        {byWeek && dayPool > 1 && (
          <Row label="Use">
            <RowSelect
              value={String(picked)}
              onChange={(v) => {
                const n = Number(v);
                patch(
                  n === 0
                    ? { randomDays: false }
                    : { randomDays: true, pickDays: n },
                );
              }}
              options={pickOptions(dayPool)}
            />
          </Row>
        )}
        {repeat === "interval" && <IntervalRows draft={draft} patch={patch} />}
        {atTime && <TimeOfDayRows draft={draft} patch={patch} />}
      </Card>
      {problem && (
        <p className="mt-2 px-1 text-[12px] leading-snug text-[var(--accent-amber-text)]">
          {problem}
        </p>
      )}
      {repeat !== "manual" && <NextRunsPreview draft={draft} />}
    </div>
  );
}
