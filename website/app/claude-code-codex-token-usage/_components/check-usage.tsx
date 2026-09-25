import Link from "next/link";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { STATUSLINE_PATH } from "@/lib/links";
import CheckUsageTable from "./check-usage-table";
import { INLINE_CODE, TEXT_LINK } from "./page-styles";

export default function CheckUsage() {
  return (
    <div id="check-usage">
      <QuickAnswer question="How to check Claude Code and Codex usage">
        <p>
          In Claude Code, run <code className={INLINE_CODE}>/usage</code> to
          see your plan usage bars with reset times, the session&apos;s cost
          and a breakdown of what used your limits;{" "}
          <code className={INLINE_CODE}>/cost</code> and{" "}
          <code className={INLINE_CODE}>/stats</code> open the same screen. In
          Codex CLI, run <code className={INLINE_CODE}>/status</code> for your
          plan&apos;s limits, usually 5-hour and weekly, as percent left, or{" "}
          <code className={INLINE_CODE}>/usage</code> for token activity. To
          watch both in one place, by project and with a pace verdict, use lpm.
        </p>
        <CheckUsageTable />
        <p>
          To keep 5-hour and weekly usage under every Claude Code prompt
          without editing config files, use lpm&apos;s{" "}
          <Link href={STATUSLINE_PATH} className={TEXT_LINK}>
            statusline editor
          </Link>
          .
        </p>
      </QuickAnswer>
    </div>
  );
}
