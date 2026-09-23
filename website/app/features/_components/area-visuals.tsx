import type { ReactNode } from "react";
import ActivityReplica from "@/app/run-claude-code-in-parallel/_components/activity-replica";
import ParallelWindow from "@/app/run-claude-code-in-parallel/_components/parallel-window";
import { WeekBoardReplica } from "@/app/schedule-claude-code-tasks/_components/week-board-replica";
import AreaVisual from "./area-visual";

export const AREA_VISUALS: Record<string, ReactNode> = {
  agents: (
    <AreaVisual caption="Activity puts whichever Claude Code or Codex session is waiting on you at the top, whatever project it lives in.">
      <ActivityReplica />
    </AreaVisual>
  ),
  parallel: (
    <AreaVisual caption="One window, five agents: the main project, two copies, and a worktree, each reporting its own status.">
      <ParallelWindow />
    </AreaVisual>
  ),
  automations: (
    <AreaVisual caption="The Week view shows when each job fires and how its recent runs went.">
      <WeekBoardReplica />
    </AreaVisual>
  ),
};
