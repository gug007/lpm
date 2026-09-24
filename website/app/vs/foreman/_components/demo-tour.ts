import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// A Rails app's Procfile.dev, taken in as the folder is added: a pane per
// line, one process brought back on its own, and a second app beside it.
export const FOREMAN_DEMO: PageDemo = {
  heading: "Add a Rails app, get a pane per Procfile line, restart css alone",
  blurb: "Click anything — the Rails stack runs in your browser.",
  lesson: "add-project",
  tour: defineTour(
    [
      {
        id: "addProject",
        folder: "bookshelf",
        title: "Add the Rails folder",
        body: "lpm reads Procfile.dev once, as you add it, and lists web, css and worker. The -p 3000 becomes web's port.",
      },
      {
        id: "start",
        title: "Start the three lines",
        body: "Each line gets a live tab of its own, and All shows them side by side instead of one interleaved stream.",
        leadMs: 2600,
      },
      {
        id: "restartService",
        service: "css",
        title: "Bring css back on its own",
        body: "Switch css off and on again in the Services menu. web and worker keep streaming the whole time.",
      },
      {
        id: "openProject",
        project: "auth-service",
        title: "Open a second repo",
        body: "auth-service sits one click away in the same sidebar, and bookshelf keeps running.",
      },
      {
        id: "start",
        title: "Run both at once",
        body: "Press Start and auth-service comes up too: two repos in one window, every process in a tab of its own.",
      },
    ],
    {
      hint: {
        short: "Adding a Rails app…",
        long: "Adding a Rails app from its Procfile.dev. Click anything.",
      },
    },
  ),
};
