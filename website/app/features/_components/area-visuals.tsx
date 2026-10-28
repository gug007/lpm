import type { ReactNode } from "react";
import { GitBarReplica } from "@/app/git-terminal-for-mac/_components/git-bar-replica";
import { PairDemoCard } from "@/app/run-claude-code-on-a-mac-mini/_components/pair-demo";
import AgentSidebarReplica from "@/app/run-claude-code-in-parallel/_components/agent-sidebar-replica";
import ParallelWindow from "@/app/run-claude-code-in-parallel/_components/parallel-window";
import { WeekBoardReplica } from "@/app/schedule-claude-code-tasks/_components/week-board-replica";
import CliSnippet from "./cli-snippet";
import ComposerReplica from "./composer-replica";
import PhoneScreens from "./phone-screens";
import ServicesReplica from "./services-replica";

export type AreaVisualSpec = {
  node: ReactNode;
  layout: "wide" | "split";
  caption?: string;
};

export const AREA_VISUALS: Record<string, AreaVisualSpec> = {
  projects: {
    layout: "wide",
    node: <ServicesReplica />,
    caption:
      "One Stop button for the whole project, and the All tab with every service's output side by side, each on the port it really listens on.",
  },
  agents: {
    layout: "wide",
    node: <AgentSidebarReplica />,
    caption:
      "Each project lists its agents underneath it in the sidebar, and a notification names the tab that needs you.",
  },
  composer: {
    layout: "split",
    node: <ComposerReplica />,
    caption: "Type @ and pick a file, folder, branch, or a service's logs to hand the agent exactly what it needs.",
  },
  parallel: {
    layout: "wide",
    node: <ParallelWindow />,
    caption:
      "One window, five agents: the main project, two copies, and a worktree, each reporting its own status.",
  },
  git: {
    layout: "split",
    node: <GitBarReplica />,
    caption: "Pick the files, let AI write the message, then commit and push in one step.",
  },
  automations: {
    layout: "wide",
    node: <WeekBoardReplica />,
    caption: "The Week view shows when each job fires and how its recent runs went.",
  },
  devices: {
    layout: "wide",
    node: <PairDemoCard />,
  },
  iphone: {
    layout: "wide",
    node: <PhoneScreens />,
  },
  cli: {
    layout: "split",
    node: <CliSnippet />,
  },
};
