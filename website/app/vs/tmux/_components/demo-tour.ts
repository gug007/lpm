import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// The job lpm takes over from tmux: pick the project, start its stack, open a
// shell next to it.
export const TMUX_DEMO: PageDemo = {
  heading: "One live pane per service, a shell in the next tab — no .tmux.conf",
  blurb: "No prefix key to learn — click anything, it runs live.",
  tour: defineTour(
    [
      {
        id: "openProject",
        project: "auth-service",
        title: "Click the project instead of attaching",
        body: "Where you would type tmux attach -t, click auth-service in the sidebar.",
        leadMs: 2600,
      },
      {
        id: "start",
        title: "Press Start",
        body: "server, postgres and redis come up at once, each in a live pane of its own.",
      },
      {
        id: "shell",
        command: "ls",
        title: "Open a shell tab",
        body: "The + beside the tabs opens a plain shell in the project folder, with no prefix key and no .tmux.conf.",
      },
      {
        id: "agent",
        title: "Open Claude Code beside the stack",
        body: "It opens in a tab next to the services, and that tab shows when it needs you.",
      },
    ],
    {
      hint: {
        short: "Click a project — every pane is live",
        long: "Click a project instead of attaching — every pane is live.",
      },
    },
  ),
};
