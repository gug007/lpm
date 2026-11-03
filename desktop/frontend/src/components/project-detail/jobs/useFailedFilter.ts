import { useState } from "react";
import type { JobInfo } from "../../../jobsFormat";
import { lastRunFailed } from "./jobRowPreview";

/** The list's Failed filter: on, it narrows the rows to those whose last run
 *  failed, and turns itself off once none are left. */
export function useFailedFilter<T extends JobInfo>(rows: T[]) {
  const [on, setOn] = useState(false);
  const failed = rows.filter(lastRunFailed);
  const active = on && failed.length > 0;
  return {
    count: failed.length,
    active,
    toggle: () => setOn(!active),
    rows: active ? failed : rows,
  };
}
