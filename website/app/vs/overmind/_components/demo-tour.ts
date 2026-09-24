import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// Overmind's per-process verbs, clicked: start a named set, read one process,
// stop it while the rest keep going.
export const OVERMIND_DEMO: PageDemo = {
  heading: "Start a profile, read one process, stop it — the others keep running",
  blurb: "Click any process tab — it runs live in your browser.",
  lesson: "switch-profiles",
  tour: defineTour(
    [
      {
        id: "startProfile",
        profile: "full",
        title: "Start a profile",
        body: "Pick full in the Start menu and web, api and worker come up together — one of several named sets you pick from a menu.",
      },
      {
        id: "serviceTab",
        service: "worker",
        title: "Read one process",
        body: "Click worker to read Sidekiq's output on its own. The tab is for reading, not typing.",
      },
      {
        id: "toggleService",
        service: "worker",
        on: false,
        title: "Stop worker, keep the rest",
        body: "Untick worker in the Services menu. web and api keep streaming.",
      },
      {
        id: "agent",
        title: "Claude Code beside the processes",
        body: "It opens in a tab next to web and api.",
      },
    ],
    {
      hint: {
        short: "Every process gets a tab",
        long: "Every process gets a tab of its own. Click anything.",
      },
    },
  ),
};
