import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// The project around the agents: its services, one agent at work, and a
// worktree so a second agent edits a checkout of its own.
export const CMUX_DEMO: PageDemo = {
  heading:
    "Start the stack, prompt Claude Code, then give Codex a worktree of its own",
  blurb: "Two agents, two checkouts — click anything, it runs live.",
  lesson: "parallel-agents",
  tour: defineTour([
    {
      id: "start",
      body: "web and api come up, each in a tab of its own with its port.",
    },
    "agent",
    {
      id: "prompt",
      title: "Prompt Claude Code",
      body: "It takes the billing change and starts working. Its state shows on its own tab and in the sidebar.",
    },
    {
      id: "copy",
      project: "saas-app",
      mode: "worktree",
      title: "Give Codex a worktree",
      body: "New Worktree on saas-app: a linked checkout on a branch of its own, where Codex starts on a second approach.",
      // Past the typed prompt before it: the turn is seen starting first.
      leadMs: 8200,
      hint: {
        short: "Two agents, two checkouts",
        long: "Codex works saas-app-wt on its own branch; Claude Code keeps going in saas-app.",
      },
    },
    {
      id: "openAgent",
      project: "saas-app",
      agent: "claude",
      title: "Check on Claude Code",
      body: "Its sidebar row jumps straight back to its tab. Each agent keeps working in its own checkout.",
      leadMs: 5600,
    },
  ]),
};
