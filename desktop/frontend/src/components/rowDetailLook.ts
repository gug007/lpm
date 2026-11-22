import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Clock,
  Diff,
  Files,
  Flag,
  GitBranch,
  GitPullRequest,
  Plug,
  Tag,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { RowDetail } from "../sidebarRowLayout";

// Each detail's icon in the Row builder, tinted by its group: work amber,
// review green, git cyan, running purple.
const WORK = "var(--accent-amber)";
const REVIEW = "var(--accent-green)";
const GIT = "var(--accent-cyan)";
const RUNNING = "var(--accent-purple)";

export const ROW_DETAIL_LOOK: Record<RowDetail, { Icon: LucideIcon; color: string }> = {
  status: { Icon: Flag, color: WORK },
  alert: { Icon: TriangleAlert, color: WORK },
  pr: { Icon: GitPullRequest, color: REVIEW },
  checks: { Icon: CircleCheck, color: REVIEW },
  branch: { Icon: GitBranch, color: GIT },
  changes: { Icon: Diff, color: GIT },
  files: { Icon: Files, color: GIT },
  origin: { Icon: ArrowDown, color: GIT },
  ahead: { Icon: ArrowUp, color: GIT },
  commit: { Icon: Clock, color: GIT },
  ports: { Icon: Plug, color: RUNNING },
  version: { Icon: Tag, color: RUNNING },
};
