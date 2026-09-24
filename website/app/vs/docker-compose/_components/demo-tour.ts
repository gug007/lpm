import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// The split stack: a repo with a compose file becomes one project, the app on
// the host and docker compose up as a service of its own beside it.
export const COMPOSE_DEMO: PageDemo = {
  heading:
    "Add a repo with a compose file: app code native, compose in a pane of its own",
  blurb: "Click anything — both halves run live in your browser.",
  lesson: "add-project",
  tour: defineTour(
    [
      {
        id: "addProject",
        folder: "auth-service",
        title: "Add a repo with a compose file",
        body: "lpm finds the Go server and the compose file. docker compose up becomes one service; lpm does not read the services inside it.",
      },
      {
        id: "start",
        title: "Start both halves",
        body: "The Go server runs on your Mac while compose brings up Postgres. All shows them side by side.",
        leadMs: 2600,
      },
      {
        id: "serviceTab",
        service: "compose",
        title: "Open the compose pane",
        body: "The container output has a tab of its own, next to the native server's.",
      },
      {
        id: "agent",
        title: "Claude Code beside the stack",
        body: "It opens in a tab next to both service panes.",
      },
    ],
    {
      omitProjects: ["auth-service"],
      hint: {
        short: "Adding a repo…",
        long: "Adding a repo with a compose file. Click anything.",
      },
    },
  ),
};
