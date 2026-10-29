import { ArrowRight } from "lucide-react";
import { useAppStore } from "../../store/app";
import { useWeeklyRecapStore } from "../../store/weeklyRecap";
import { XIcon } from "../icons";
import { Modal } from "../ui/Modal";
import { SegmentedControl } from "../ui/SegmentedControl";
import { RecapCardSkeleton } from "./RecapCardSkeleton";
import { RecapRowPicks } from "./RecapRowPicks";
import { RecapShareBar } from "./RecapShareBar";
import { RecapThemePicks } from "./RecapThemePicks";
import { useRecapLook } from "./useRecapLook";
import { useWeeklyRecap } from "./useWeeklyRecap";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import {
  recapRangeLabel,
  recapStart,
  recapTitle,
  type RecapPeriod,
  type RecapWeek,
} from "./weeklyRecapModel";

const WHICH = [
  { value: "last", label: "Last" },
  { value: "this", label: "This" },
] as const;

const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

function missingNote(names: string[], period: RecapPeriod): string {
  const one = names.length === 1;
  return `Not counted: ${listFormat.format(names)}, which couldn't send ${one ? "its" : "their"} ${period}.`;
}

/** "Your week in lpm", or month, opened from the sidebar's More menu or Monday's toast. */
export function WeeklyRecapModal() {
  const open = useWeeklyRecapStore((s) => s.open);
  const which = useWeeklyRecapStore((s) => s.week);
  const period = useWeeklyRecapStore((s) => s.period);
  const show = useWeeklyRecapStore((s) => s.show);
  const close = useWeeklyRecapStore((s) => s.close);
  const setView = useAppStore((s) => s.setView);
  const week = open ? recapStart(which, period) : null;
  const { recap, loading, error, reload } = useWeeklyRecap(week, period);

  const { full, view, theme, leftOut } = useRecapLook(recap);

  const openStats = () => {
    close();
    setView("stats");
  };

  return (
    <Modal
      open={open}
      onClose={close}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="w-[min(648px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[calc(100vh-48px)] flex-col overflow-y-auto px-6 pb-5 pt-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              {period === "month" ? "Monthly recap" : "Weekly recap"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Your agents' {period}, ready to share.</p>
          </div>
          <SegmentedControl
            value={which}
            options={WHICH}
            onChange={(next: RecapWeek) => show(next, period)}
            ariaLabel={`Which ${period}`}
          />
          <SegmentedControl
            value={period}
            options={PERIODS}
            onChange={(next: RecapPeriod) => show(which, next)}
            ariaLabel="Week or month"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-4 py-3 text-sm text-[var(--accent-red-text)]">
            <span>Could not read the {period}: {error}</span>
            <button type="button" onClick={() => void reload()} className="shrink-0 font-medium underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : !view ? (
          <>
            <div className="mb-3">
              <RecapRowPicks full={null} leftOut={leftOut} />
            </div>
            <RecapCardSkeleton
              title={recapTitle(period)}
              range={week ? recapRangeLabel(week, period) : ""}
              theme={theme}
              leftOut={leftOut}
            />
            <div className="mt-4 flex min-h-[30px] items-center justify-end">
              <RecapThemePicks theme={theme} />
            </div>
          </>
        ) : view.empty ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-6 text-center">
            <div className="text-sm font-medium">
              No agent work {which === "last" ? `last ${period}` : `this ${period} yet`}
            </div>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)]">
              The recap counts Claude Code and Codex sessions run in your projects.
            </p>
            {which === "last" && (
              <button type="button" onClick={() => show("this", period)} className="mt-3 text-xs font-medium text-[var(--accent-blue)] hover:underline">
                See this {period} so far
              </button>
            )}
          </div>
        ) : (
          <>
            {full && (
              <div className="mb-3">
                <RecapRowPicks full={full} leftOut={leftOut} />
              </div>
            )}
            <div className="transition-opacity" style={{ opacity: loading ? 0.6 : 1 }}>
              <WeeklyRecapCard view={view} theme={theme} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <RecapShareBar view={view} theme={theme} />
              <RecapThemePicks theme={theme} />
            </div>
          </>
        )}

        <div className="mt-4 flex items-start gap-4 border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-[var(--text-muted)]">
          <div className="min-w-0 flex-1 space-y-1">
            <p>Names no projects, and nothing is uploaded: you add the card to the post yourself.</p>
            {recap?.missing && recap.missing.length > 0 && <p>{missingNote(recap.missing, period)}</p>}
          </div>
          <button
            type="button"
            onClick={openStats}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Open Stats
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
