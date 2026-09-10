import type { WorkStatus } from "../types";
import { BLOCKED_TONE_CLASS, workStatusLabel } from "../workStatus";
import { ROLLUP_SEPARATOR_CLASS } from "./sidebarRollup";

/** The second line of a row whose status carries a note: the status's word,
 *  then the note, in the same 10px voice a folded deck uses for its rollup so
 *  the two never differ. Only Blocked's word takes colour. */
export function SidebarWorkStatusLine({ status, note }: { status: WorkStatus; note: string }) {
  return (
    <>
      <span className={status.state === "blocked" ? BLOCKED_TONE_CLASS : undefined}>
        {workStatusLabel(status)}
      </span>
      <span className={ROLLUP_SEPARATOR_CLASS}>·</span>
      <span>{note}</span>
    </>
  );
}
