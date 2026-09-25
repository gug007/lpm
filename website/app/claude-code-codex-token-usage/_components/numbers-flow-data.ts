import {
  ChartColumn,
  CopyCheck,
  EyeOff,
  FileText,
  FolderTree,
  Gauge,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { MOBILE_PATH } from "@/lib/links";

export type FlowItem = {
  icon: LucideIcon;
  lead: string;
  href?: string;
  code?: string;
  detail?: string;
};

export type FlowStage = { title: string; highlight?: boolean; items: FlowItem[] };

export const FLOW_STAGES: FlowStage[] = [
  {
    title: "What the agents record",
    items: [
      {
        icon: FileText,
        lead: "Claude Code session files",
        code: "~/.claude/projects",
        detail: ", plus every Claude account lpm manages",
      },
      { icon: FileText, lead: "Codex session files", code: "~/.codex/sessions" },
      {
        icon: Gauge,
        lead: "Claude Code's statusline data",
        detail: "5-hour and weekly percentages, once you press Enable",
      },
      {
        icon: Gauge,
        lead: "Codex limit readings",
        detail: "written into its session files as it runs",
      },
    ],
  },
  {
    title: "What lpm does on your Mac",
    highlight: true,
    items: [
      {
        icon: FolderTree,
        lead: "Matches each session to its project",
        detail:
          "each copy and worktree is its own project, and when folders nest the deepest match wins",
      },
      {
        icon: EyeOff,
        lead: "Keeps token counts only",
        detail: "prompts and responses stay out",
      },
      {
        icon: CopyCheck,
        lead: "Counts each reply once",
        detail:
          "repeated streaming updates and replayed subagent history are skipped",
      },
    ],
  },
  {
    title: "Where you see it",
    items: [
      {
        icon: ChartColumn,
        lead: "Stats",
        detail: "tokens, estimated cost, projects and sessions",
      },
      {
        icon: Gauge,
        lead: "Usage and the sidebar meter",
        detail: "live 5-hour and weekly limits with pace",
      },
      {
        icon: Smartphone,
        lead: "lpm iPhone app",
        href: MOBILE_PATH,
        detail:
          "straight from your Mac over your network or tailnet, no cloud relay",
      },
    ],
  },
];
