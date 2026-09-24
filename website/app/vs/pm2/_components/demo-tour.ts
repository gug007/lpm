import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// The workspace PM2 leaves out locally: a pane per service, a copy of a repo
// for a second agent, and a switcher between them.
export const PM2_DEMO: PageDemo = {
  heading:
    "A pane per service, a copy per agent, and a sidebar to switch between them",
  blurb: "Click anything — each repo runs live in your browser.",
  lesson: "parallel-agents",
  tour: defineTour(
    [
      {
        id: "openProject",
        project: "auth-service",
        title: "Open a stack that isn't only Node",
        body: "auth-service is a Go server with Postgres and Redis beside it, all in one project.",
        leadMs: 2600,
      },
      {
        id: "start",
        title: "Start it",
        body: "Each service gets a live pane of its own instead of one merged log stream.",
      },
      {
        id: "copy",
        project: "saas-app",
        mode: "duplicate",
        title: "Copy another repo for a second agent",
        body: "Duplicate saas-app: the copy gets its own checkout, with Codex working in it. It shares ports and the database.",
        leadMs: 4200,
      },
      {
        id: "openProject",
        project: "auth-service",
        title: "Switch back",
        body: "auth-service is still streaming. Switching projects restarts nothing.",
        leadMs: 4400,
      },
    ],
    {
      hint: {
        short: "Two repos, one window",
        long: "Two repos, one window — every pane is live. Click anything.",
      },
    },
  ),
};
