import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// A multi-service stack: boot it, add one service to it, preview it, then
// start a second repo beside it.
export const STACK_DEMO: PageDemo = {
  heading: "One click boots the stack, and switching repos stops nothing",
  blurb: "Click anything — every service runs live in your browser.",
  lesson: "start-project",
  tour: defineTour([
    {
      id: "start",
      title: "Boot the stack",
      body: "One click starts web and api. Each gets a log tab of its own, labeled with its port.",
    },
    {
      id: "toggleService",
      service: "worker",
      on: true,
      title: "Add a service, restart nothing",
      body: "Tick worker in the Services menu. Sidekiq starts in a tab of its own while web and api keep running.",
    },
    {
      id: "serviceTab",
      service: "api",
      title: "Read one service on its own",
      body: "Click the api tab and Rails' output stands alone, apart from web's, so you can see which one threw.",
    },
    {
      id: "openProject",
      project: "auth-service",
      title: "Switch repos",
      body: "Click auth-service in the sidebar. saas-app keeps running — its dot stays green.",
    },
    {
      id: "start",
      title: "Start the second stack",
      body: "The Go server, Postgres and Redis come up, each in its own tab. Two stacks, one window.",
    },
  ]),
};
