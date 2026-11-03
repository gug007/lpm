import type { PageDemo } from "@/components/home/demo";
import { defineTour } from "@/components/home/tour";

export const LINUX_DEMO: PageDemo = {
  heading: "Boot the stack, add a service, then hand the project to Claude Code",
  blurb: "Click anything — it all runs live in your browser.",
  lesson: "start-project",
  tour: defineTour([
    {
      id: "start",
      title: "Boot the stack",
      body: "One click starts web and api, each in a log tab of its own, labeled with its port.",
    },
    {
      id: "toggleService",
      service: "worker",
      on: true,
      title: "Add a service, restart nothing",
      body: "Tick worker in the Services menu. It starts in a tab of its own while web and api keep running.",
    },
    {
      id: "serviceTab",
      service: "api",
      title: "Read one service on its own",
      body: "Click the api tab and its output stands apart from web's, so you can tell which one threw.",
    },
    {
      id: "agent",
      title: "Hand it to Claude Code",
      body: "One click opens Claude Code in the project folder, beside the running services.",
    },
  ]),
};
