import { SOURCE, type AppMessage } from "./protocol";

// A turn that ends in the demo, told to the page around it, which can call a
// visitor who has switched tabs back the way the app's alerts would.
export function announceTurnEnd(project: string, agent: string, state: "done" | "waiting"): void {
  if (window.parent === window) return;
  const message: AppMessage = { source: SOURCE, type: "agent", project, agent, state };
  window.parent.postMessage(message, window.location.origin);
}
