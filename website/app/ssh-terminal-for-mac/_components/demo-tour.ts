import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// A local project and a remote one in the same sidebar: add the box from your
// SSH config, work in it, and click back to your Mac.
export const SSH_DEMO: PageDemo = {
  heading: "Your local stack and a remote dev box, one sidebar click apart",
  blurb: "Click anything — the SSH host is simulated in your browser.",
  tour: defineTour([
    {
      id: "start",
      title: "Start your local project",
      body: "saas-app boots on your Mac: web and api, each in a tab of its own.",
    },
    {
      id: "addSshHost",
      host: "devbox",
      title: "Pick a host from ~/.ssh/config",
      body: "Add project, then SSH Host: the hosts in your SSH config are listed. Pick devbox and it joins the same sidebar.",
      hint: {
        short: "devbox joined the sidebar",
        long: "devbox is in the same sidebar as saas-app. Click anything.",
      },
    },
    {
      id: "start",
      title: "Start the remote project",
      body: "devbox's login shell streams into a pane, the way a local service does.",
      leadMs: 2600,
    },
    {
      id: "agent",
      title: "Open Claude Code on the box",
      body: "Claude Code opens in a tab beside the remote shell, working in devbox's folder.",
    },
    {
      id: "openProject",
      project: "saas-app",
      title: "Back to your Mac",
      body: "One click on saas-app: web and api are still streaming locally, and devbox keeps its shell.",
      leadMs: 4200,
    },
  ]),
};
