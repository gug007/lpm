import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// Git in the same window as the dev server: a shell and the diff a tab away
// from the running logs, a commit, a branch switch — and the servers never
// stop.
export const GIT_DEMO: PageDemo = {
  heading:
    "Review, commit, and switch branches while the dev server keeps streaming",
  tour: defineTour([
    {
      id: "start",
      title: "Start the dev server",
      body: "web and api come up in the project's pane, and they keep streaming through all of it.",
    },
    {
      id: "shell",
      command: "git status",
      title: "Run git in the next tab",
      body: "The + beside the tabs opens a shell in the project folder. git status lists the three files changed on feat/billing-flow.",
    },
    {
      id: "review",
      title: "Read the diff in its own tab",
      body: "Review changes opens those files as a diff, a tab away from the web and api logs, which keep streaming.",
      leadMs: 5000,
    },
    {
      id: "commit",
      title: "Commit from the Git bar",
      body: "The working tree is committed: the diff clears, the branch pill loses its dot, and the push count goes up by one.",
    },
    {
      id: "checkout",
      branch: "main",
      title: "Switch branches mid-session",
      body: "Pick main in the branch switcher. The pill flips, and web and api never stop.",
    },
  ]),
};
