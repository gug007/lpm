import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// Put an agent to work, answer another project's call from the sidebar, then
// come back to the first one still running.
export const SIDEBAR_DEMO: PageDemo = {
  heading:
    "Every project is a row — click one and its whole workspace swaps in",
  blurb: "Click any row — it runs live in your browser.",
  tour: defineTour([
    "start",
    "agent",
    "prompt",
    {
      id: "openProject",
      project: "ml-pipeline",
      title: "Switch to the row that needs you",
      body: "An amber name means an agent there is stuck on a question. Click the row and that project's whole workspace takes the window.",
      leadMs: 8800,
    },
    {
      id: "openProject",
      project: "saas-app",
      title: "Come back to where you were",
      body: "Click the first row again. Its services never stopped, and Claude Code kept going while you were away.",
      leadMs: 5200,
      hint: {
        short: "Nothing restarted — click any row",
        long: "Back where you left it — nothing restarted. Click any row.",
      },
    },
  ]),
};
