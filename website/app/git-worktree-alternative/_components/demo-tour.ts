import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// Both ways to a second checkout, made from the same project mid-change: the
// Duplicate carries Claude Code's uncommitted edits across, the worktree starts
// from the current commit. Review sits between them so the difference is on
// screen, not only in the caption.
export const WORKTREE_ALT_DEMO: PageDemo = {
  heading:
    "Duplicate a project or add a Git worktree, and see what each one starts with",
  blurb: "Right-click saas-app and try both — it runs live.",
  lesson: "parallel-agents",
  tour: defineTour([
    {
      id: "start",
      body: "Start brings up saas-app's web and api services, each in a tab of its own with its port.",
    },
    "agent",
    {
      id: "prompt",
      title: "Prompt Claude Code",
      body: "It starts on the billing change. Its edits land in saas-app's working tree and stay uncommitted.",
    },
    {
      id: "copy",
      project: "saas-app",
      mode: "duplicate",
      title: "Duplicate the project",
      body: "Choose Duplicate in saas-app's menu. The copy nests under saas-app on the same branch; the dialog can start Codex in it.",
      // Past Claude Code's edits: the copy is made from a tree that has them.
      leadMs: 9000,
      hint: {
        short: "A copy on the same branch",
        long: "The copy stays on feat/billing-flow. Claude Code keeps going in saas-app.",
      },
    },
    {
      id: "review",
      title: "See what came along",
      body: "The copy's Review changes tab lists Claude Code's billing edits, still uncommitted. A Git worktree would start without them.",
      leadMs: 4200,
      hint: {
        short: "The uncommitted edits came along",
        long: "The copy has saas-app's uncommitted billing edits — no commit or stash first.",
      },
    },
    {
      id: "copy",
      project: "saas-app",
      mode: "worktree",
      title: "Now add a Git worktree",
      body: "New Worktree, one row down, opens the same dialog and can start Codex too. The worktree starts clean on a new lpm/ branch.",
      leadMs: 6400,
      hint: {
        short: "One copy, one worktree",
        long: "The copy kept the edits; the worktree starts clean on a branch of its own.",
      },
    },
    {
      id: "openAgent",
      project: "saas-app",
      agent: "claude",
      title: "Check on Claude Code",
      body: "Its sidebar row jumps back to its tab. Three folders, three agents, and no edit lands on top of another.",
      leadMs: 5600,
    },
  ]),
};
