import { WeekdayPicker } from "./WeekdayPicker";
import { RowSelect } from "./RowSelect";
import { Card, GroupLabel, Row, RowNumber } from "./JobFormRows";
import type { IntervalUnit, JobDraft } from "../../../jobsFormat";

// The UI's repeat vocabulary, derived from (and written back to) the draft's
// schedule fields.
export type Repeat = "daily" | "days" | "interval" | "manual";

const TIME_INPUT_CLASS =
  "border-none bg-transparent text-right text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:text-[var(--text-primary)] focus:text-[var(--text-primary)]";

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

// When the job runs: how often it repeats, and — for a job that runs at a time
// of day — whether that time is fixed or drawn fresh from a window each day.
export function JobFrequencyCard({
  draft,
  patch,
  summary,
}: {
  draft: JobDraft;
  patch: (values: Partial<JobDraft>) => void;
  summary: string;
}) {
  const repeat: Repeat =
    draft.scheduleMode === "manual"
      ? "manual"
      : draft.scheduleMode === "interval"
        ? "interval"
        : draft.days.length > 0
          ? "days"
          : "daily";

  const setRepeat = (next: Repeat) => {
    if (next === "manual" || next === "interval") {
      patch({ scheduleMode: next });
      return;
    }
    patch({
      scheduleMode: "time",
      days: next === "daily" ? [] : draft.days.length > 0 ? draft.days : ["mon"],
    });
  };

  const atTime = repeat === "daily" || repeat === "days";
  // The days a random pick draws from: the ones selected, or all seven.
  const dayPool = draft.days.length === 0 ? 7 : draft.days.length;
  const picked = draft.randomDays ? Math.min(draft.pickDays, dayPool) : 0;

  return (
    <div>
      <GroupLabel>Frequency</GroupLabel>
      <Card>
        <Row label="Repeat">
          <RowSelect
            value={repeat}
            onChange={(v) => setRepeat(v as Repeat)}
            options={[
              { value: "daily", label: "Every day" },
              { value: "days", label: "On certain days" },
              { value: "interval", label: "On an interval" },
              { value: "manual", label: "Manually" },
            ]}
          />
        </Row>
        {repeat === "days" && (
          <Row label="On" alignTop>
            <WeekdayPicker
              value={draft.days}
              onChange={(days) => patch({ days })}
            />
          </Row>
        )}
        {atTime && dayPool > 1 && (
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
        {repeat === "interval" && (
          <>
            <Row label="Gap">
              <RowSelect
                value={draft.varyInterval ? "vary" : "fixed"}
                onChange={(v) =>
                  patch({
                    varyInterval: v === "vary",
                    intervalMaxValue: Math.max(
                      draft.intervalMaxValue,
                      draft.intervalValue,
                    ),
                  })
                }
                options={[
                  { value: "fixed", label: "Always the same" },
                  { value: "vary", label: "Varies within a range" },
                ]}
              />
            </Row>
            <Row label={draft.varyInterval ? "Between" : "Every"}>
              <span className="flex items-center gap-2">
                <RowNumber
                  value={draft.intervalValue}
                  min={1}
                  onChange={(intervalValue) =>
                    patch({
                      intervalValue,
                      intervalMaxValue: Math.max(
                        draft.intervalMaxValue,
                        intervalValue,
                      ),
                    })
                  }
                />
                {draft.varyInterval && (
                  <>
                    <span className="text-[13px] text-[var(--text-muted)]">
                      and
                    </span>
                    <RowNumber
                      value={draft.intervalMaxValue}
                      min={draft.intervalValue}
                      onChange={(intervalMaxValue) =>
                        patch({ intervalMaxValue })
                      }
                    />
                  </>
                )}
                <RowSelect
                  value={draft.intervalUnit}
                  onChange={(u) => patch({ intervalUnit: u as IntervalUnit })}
                  options={[
                    { value: "minutes", label: "minutes" },
                    { value: "hours", label: "hours" },
                    { value: "days", label: "days" },
                  ]}
                />
              </span>
            </Row>
          </>
        )}
        {atTime && (
          <>
            <Row label="Time">
              <RowSelect
                value={draft.randomWindow ? "window" : "fixed"}
                onChange={(v) => patch({ randomWindow: v === "window" })}
                options={[
                  { value: "fixed", label: "A set time" },
                  { value: "window", label: "A random time in a window" },
                ]}
              />
            </Row>
            <Row label={draft.randomWindow ? "Between" : "At"}>
              <span className="flex items-center gap-2">
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => patch({ time: e.target.value })}
                  className={TIME_INPUT_CLASS}
                />
                {draft.randomWindow && (
                  <>
                    <span className="text-[13px] text-[var(--text-muted)]">
                      and
                    </span>
                    <input
                      type="time"
                      value={draft.untilTime}
                      onChange={(e) => patch({ untilTime: e.target.value })}
                      className={TIME_INPUT_CLASS}
                    />
                  </>
                )}
              </span>
            </Row>
            {draft.randomWindow && (
              <Row label="Runs">
                <span className="flex items-center gap-2">
                  <RowNumber
                    value={draft.timesPerDay}
                    min={1}
                    onChange={(timesPerDay) => patch({ timesPerDay })}
                  />
                  <span className="text-[13px] text-[var(--text-muted)]">
                    a day
                  </span>
                </span>
              </Row>
            )}
          </>
        )}
      </Card>
      {summary && (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          {summary}.
          {atTime &&
            !draft.randomWindow &&
            " It starts within a few minutes of that time, so automations set to the same hour don't all begin at once."}
          {atTime &&
            draft.randomWindow &&
            " The time inside the window is picked for you and changes each day."}
          {repeat === "interval" &&
            draft.varyInterval &&
            " The gap is picked fresh after every run."}
        </p>
      )}
    </div>
  );
}
