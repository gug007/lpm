import type { YouTubeLessonId } from "./youtube-lessons";

export type LessonChapters = {
  seconds: number;
  chapters: readonly (readonly [start: number, name: string])[];
};

// Length and chapter list from each video's YouTube page.
export const LESSON_CHAPTERS: Record<YouTubeLessonId, LessonChapters> = {
  "add-project": {
    seconds: 147,
    chapters: [
      [0, "Two ways to add a project"],
      [14, "The Add project button"],
      [27, "Pick a local folder"],
      [57, "Clone a repository"],
      [99, "Say hello to Claude"],
      [131, "Wrap-up"],
    ],
  },
  "start-project": {
    seconds: 115,
    chapters: [
      [0, "Intro"],
      [16, "Start a single dev server"],
      [35, "The port badge and the green dot"],
      [48, "Stop it"],
      [58, "A project with three services"],
      [69, "Start all three at once"],
      [82, "The All view"],
      [94, "Start just one service"],
    ],
  },
  "edit-services": {
    seconds: 124,
    chapters: [
      [0, "Intro"],
      [15, "Edit a service"],
      [32, "The Advanced fields"],
      [42, "Set the port and save"],
      [68, "Add a service"],
      [83, "The live menu preview"],
      [95, "Start both services"],
      [108, "Wrap-up"],
    ],
  },
  "add-action": {
    seconds: 126,
    chapters: [
      [0, "Add an action"],
      [11, "The + Action button and the suggestions"],
      [29, "Name and command"],
      [42, "How it looks"],
      [51, "How it runs"],
      [66, "Create and run the action"],
      [85, "Start from a suggested script"],
      [108, "Edit, move or delete an action"],
    ],
  },
  "switch-profiles": {
    seconds: 107,
    chapters: [
      [0, "What a profile is"],
      [15, "Start all four services"],
      [31, "The Profiles section"],
      [43, "Add a smaller profile"],
      [69, "Switch to default"],
      [79, "Switch back to full"],
      [92, "Recap"],
    ],
  },
  "parallel-agents": {
    seconds: 110,
    chapters: [
      [0, "One checkout, one agent at a time"],
      [17, "Duplicate the project"],
      [29, "Name the copies"],
      [41, "Give each copy a task"],
      [54, "Codex on the second copy"],
      [67, "Create the copies"],
      [79, "Claude and Codex at work"],
      [94, "Two, three, or ten copies"],
    ],
  },
  "multiple-accounts": {
    seconds: 116,
    chapters: [
      [0, "Multiple Claude Code accounts on one Mac"],
      [15, "Add a second account"],
      [33, "Sign in to the new account"],
      [48, "Pick an account for a project"],
      [59, "Run Claude on the second account"],
      [93, "Switch when one hits its limit"],
    ],
  },
  "accounts-switching": {
    seconds: 177,
    chapters: [
      [0, "Intro"],
      [18, "Add an account"],
      [56, "One account for a project"],
      [89, "Switch automatically"],
      [146, "A project's own list"],
    ],
  },
  "codex-statusline": {
    seconds: 88,
    chapters: [
      [0, "Codex statusline"],
      [10, "The default status line"],
      [23, "Open the Codex status line settings"],
      [40, "Pick the Usage layout"],
      [55, "Save and open a new Codex session"],
      [70, "Usage limits and context left under the prompt"],
    ],
  },
  "claude-statusline": {
    seconds: 103,
    chapters: [
      [0, "The Claude Code statusline"],
      [18, "Open the status line settings"],
      [41, "Pick a layout and remove an item"],
      [61, "Claude picks it up, no restart"],
      [77, "Context left, 5-hour and weekly limits"],
    ],
  },
  "review-code-changes": {
    seconds: 100,
    chapters: [
      [0, "Intro"],
      [13, "Ask Claude for a change"],
      [34, "Review the diffs"],
      [61, "Undo and commit"],
    ],
  },
  "action-zones": {
    seconds: 189,
    chapters: [
      [0, "Intro"],
      [21, "Create a zone"],
      [32, "Name and height"],
      [51, "Add buttons"],
      [64, "Add layers"],
      [89, "Name the layers"],
      [109, "Move a button to another layer"],
      [125, "Start with an empty zone"],
      [144, "Pick a zone in the action form"],
      [157, "Remove a zone"],
    ],
  },
  "connect-iphone": {
    seconds: 221,
    chapters: [
      [0, "Get lpm Link and turn on Remote control"],
      [41, "Why Built-in Tailscale"],
      [59, "Set up Tailscale on the Mac"],
      [80, "Set up Tailscale on the iPhone"],
      [109, "Pair the iPhone"],
      [144, "Run Claude Code from the iPhone"],
      [182, "If you paired before"],
      [196, "Use it away from home"],
    ],
  },
  "create-an-automation": {
    seconds: 310,
    chapters: [
      [0, "Intro"],
      [10, "Open the editor"],
      [26, "What it does"],
      [77, "Where it runs"],
      [124, "Reports"],
      [150, "Only when there's work"],
      [175, "When it runs"],
      [263, "Run it"],
    ],
  },
  "run-any-ai-coding-agent": {
    seconds: 80,
    chapters: [
      [0, "Intro"],
      [13, "Add an agent"],
      [36, "Side by side"],
    ],
  },
  "auto-pull-complete-guide": {
    seconds: 180,
    chapters: [
      [0, "Intro"],
      [24, "Turn it on"],
      [47, "It pulls on its own"],
      [62, "Undo"],
      [90, "When it waits"],
      [122, "Choose per project"],
    ],
  },
  "dynamic-action-labels": {
    seconds: 235,
    chapters: [
      [0, "Intro"],
      [12, "Put live info in a label"],
      [57, "Pick a bump"],
      [77, "Labels from a command"],
      [115, "Updates when the code changes"],
      [133, "A count from GitHub"],
      [174, "Refresh on a timer"],
    ],
  },
  "share-terminal-in-browser": {
    seconds: 135,
    chapters: [
      [0, "Intro"],
      [20, "Share a tab"],
      [31, "Join from a browser"],
      [53, "Watch live"],
      [76, "Let them type"],
      [108, "Stop sharing"],
    ],
  },
  "claude-code-codex-remote-server": {
    seconds: 203,
    chapters: [
      [0, "Intro"],
      [13, "Two ways to add a server"],
      [41, "Set up a Linux host"],
      [82, "Many projects on one host"],
      [104, "Claude Code and Codex on the host"],
      [142, "Just SSH in"],
    ],
  },
  "keep-agents-running-on-server": {
    seconds: 109,
    chapters: [
      [0, "Intro"],
      [12, "Why a server"],
      [24, "Connect the server"],
      [41, "Start the agents"],
      [58, "Close the laptop"],
      [78, "Come back"],
    ],
  },
  "automations-that-ask-you-first": {
    seconds: 196,
    chapters: [
      [0, "Intro"],
      [11, "Tell it when to ask"],
      [71, "It asks"],
      [116, "Answer it"],
      [137, "Answer in your own words"],
      [168, "Good to know"],
    ],
  },
  "run-agent-commands-in-one-click": {
    seconds: 83,
    chapters: [
      [0, "Intro"],
      [11, "Ask Claude Code"],
      [23, "Click to run"],
      [43, "Codex too"],
      [61, "Risky commands"],
    ],
  },
  "sync-ignored-files": {
    seconds: 98,
    chapters: [
      [0, "Intro"],
      [12, "Why sync them"],
      [25, "Pick the files"],
      [62, "Sync"],
      [75, "Check the Mac mini"],
    ],
  },
  "lpm-in-3-minutes": {
    seconds: 199,
    chapters: [
      [0, "Start your whole stack in one click"],
      [39, "Free a busy port in one click"],
      [64, "Claude Code and Codex, side by side"],
      [84, "Make a one-click button while agents work"],
      [113, "Run agents in parallel copies"],
      [142, "Keep the best, review and commit"],
      [169, "Automations, servers and your phone"],
    ],
  },
};
