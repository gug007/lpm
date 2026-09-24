import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// What an emulator does not own: the project — its services and their ports,
// profiles that are sets of services, saved commands, and the agent's tab.
export const ITERM2_DEMO: PageDemo = {
  heading:
    "Projects, not just panes — start the stack, pick a profile, open Claude Code",
  blurb: "Keep iTerm2 for the shell. Click anything — it runs live.",
  lesson: "switch-profiles",
  tour: defineTour([
    {
      id: "start",
      title: "Start the project",
      body: "One click brings up web and api from the default profile, and each service tab carries the port it listens on.",
    },
    {
      id: "startProfile",
      profile: "frontend",
      title: "Switch to a profile",
      body: "Pick frontend in the Start menu and the project comes back as web alone on :3000, with api left off. Here a profile is a set of services.",
    },
    {
      id: "runAction",
      action: "deploy",
      title: "Run a saved command",
      body: "Deploy is a button: it asks before it runs, then streams the result, with nothing to dig out of shell history.",
      leadMs: 6800,
    },
    {
      id: "agent",
      body: "Claude Code opens in the next tab, already in the project folder.",
    },
    {
      id: "prompt",
      title: "Hand it a task",
      body: "The turn streams back in its tab, and the tab's label shimmers while it works.",
    },
  ]),
};
