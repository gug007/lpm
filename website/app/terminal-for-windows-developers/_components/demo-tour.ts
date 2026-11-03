import type { PageDemo } from "@/components/home/demo";
import { defineTour } from "@/components/home/tour";

export const WINDOWS_DEMO: PageDemo = {
  heading: "Boot the stack, open a shell beside it, then hand it to Claude Code",
  blurb: "Click anything — it all runs live in your browser.",
  lesson: "start-project",
  tour: defineTour([
    {
      id: "start",
      title: "Boot the stack",
      body: "One click starts web and api. Each streams in a tab of its own, labeled with its port.",
    },
    {
      id: "shell",
      command: "git status",
      title: "Open a shell in the next tab",
      body: "The + beside the tabs opens your shell in the project folder (Git Bash on Windows) while the services keep streaming.",
    },
    {
      id: "agent",
      title: "Hand it to Claude Code",
      body: "One click opens Claude Code in the project folder, beside the running services.",
    },
    {
      id: "openProject",
      project: "auth-service",
      title: "Switch repos",
      body: "Click auth-service in the sidebar. saas-app keeps running, and its dot stays green.",
    },
  ]),
};
