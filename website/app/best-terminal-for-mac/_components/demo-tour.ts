import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// A terminal first: logs per service, a shell in the next tab, and a project
// switch that leaves everything running.
export const MAC_TERMINAL_DEMO: PageDemo = {
  heading:
    "Open a shell next to your logs, then switch projects without stopping them",
  tour: defineTour([
    {
      id: "start",
      body: "One click boots web and api. Each streams live output in its own tab, and All shows them side by side.",
    },
    {
      id: "shell",
      command: "ls",
      title: "Open a shell in the next tab",
      body: "The + beside the tabs opens your shell in the project folder, next to the running services.",
    },
    {
      id: "openProject",
      project: "docs-site",
      title: "Switch to another project",
      body: "Click docs-site in the sidebar. Its Claude Code session is where it finished, and saas-app keeps its green dot.",
      leadMs: 3800,
    },
    {
      id: "openProject",
      project: "saas-app",
      title: "Come back to it as you left it",
      body: "Back on saas-app, the logs are still streaming and the shell tab is where you left it.",
      leadMs: 3600,
    },
  ]),
};
