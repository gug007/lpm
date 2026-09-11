import type { ReactNode } from "react";
import type { WorkStatus } from "../types";
import { BLOCKED_TONE_CLASS, workStatusLabel } from "../workStatus";
import { ROLLUP_SEPARATOR_CLASS } from "./sidebarRollup";

/** The line under a row's name when its status has something to say: the
 *  state's word, then the note, in the same 10px voice a folded deck uses, so
 *  the two never differ. The emoji is not repeated here — it stands at the end
 *  of line 1. Only Blocked's word takes colour. */
export function SidebarWorkStatusLine({ status, children }: { status: WorkStatus; children?: ReactNode }) {
  return (
    <span>
      <span className={status.state === "blocked" ? BLOCKED_TONE_CLASS : undefined}>
        {workStatusLabel(status)}
      </span>
      {children != null && children !== "" && (
        <>
          <span className={ROLLUP_SEPARATOR_CLASS}>·</span>
          {children}
        </>
      )}
    </span>
  );
}
