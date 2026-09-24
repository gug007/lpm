import { defineTour } from "@/components/demo/tour";
import type { PageDemo } from "@/components/home/demo";

// Two agents on two projects: one working, one stopped on a question — the
// sidebar shows which, and one click answers it.
export const AGENTS_DEMO: PageDemo = {
  heading:
    "Every Claude Code and Codex session in view — answer the one that needs you",
  tour: defineTour([
    "start",
    "agent",
    {
      id: "prompt",
      body: "Ask for the change in the composer. While Claude Code works, its tab and its sidebar row shimmer, with a timer.",
    },
    {
      id: "openAgent",
      project: "ml-pipeline",
      agent: "codex",
      title: "Jump to the one that needs you",
      body: "Codex on ml-pipeline stopped to ask before anything is committed. Its sidebar row turns amber with a bell, and one click opens its tab.",
      // Past the typed prompt before it: the turn is seen starting first.
      leadMs: 7200,
      hint: {
        short: "Codex is asking — answer it",
        long: "Codex is waiting on a yes. Claude Code keeps working in saas-app.",
      },
    },
    {
      id: "answer",
      project: "ml-pipeline",
      agent: "codex",
      text: "Yes, refit and score it",
      title: "Answer it and move on",
      body: "Type the answer. Codex picks the task back up, and its row goes from the amber bell back to a shimmer, then a blue check.",
      hint: {
        short: "Codex gets its answer",
        long: "Codex gets its yes, and Claude Code never stopped.",
      },
    },
  ]),
};
