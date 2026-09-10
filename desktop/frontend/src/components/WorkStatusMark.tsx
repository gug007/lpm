import type { WorkStatus } from "../types";
import { workStatusEmoji, workStatusLabel, workStatusTitle } from "../workStatus";
import { WorkStatusEmoji } from "./WorkStatusEmoji";

/** What a row shows, before its name, for the status a person gave it: the
 *  state's emoji, with the name and any note as the tooltip. A custom status
 *  that somehow lost its emoji falls back to its name so the mark is never
 *  blank. */
export function WorkStatusMark({ status }: { status: WorkStatus }) {
  const emoji = workStatusEmoji(status);
  if (!emoji) {
    return (
      <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
        {workStatusLabel(status)}
      </span>
    );
  }
  return (
    <span title={workStatusTitle(status)} className="flex shrink-0 items-center">
      <WorkStatusEmoji emoji={emoji} />
    </span>
  );
}
