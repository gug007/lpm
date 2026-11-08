import type { YouTubeLessonId } from "./youtube-lessons";

export type LessonChapters = {
  seconds: number;
  chapters: readonly (readonly [start: number, name: string])[];
};

// Length and chapter list from each video's YouTube page.
export const LESSON_CHAPTERS: Record<YouTubeLessonId, LessonChapters> = {
  "add-project": {
    seconds: 129,
    chapters: [
      [0, "Two ways to add a project"],
      [25, "Open a folder"],
      [48, "Clone a repository"],
      [92, "Ask Claude Code about it"],
    ],
  },
  "start-project": {
    seconds: 111,
    chapters: [
      [0, "Start a dev server"],
      [27, "Watch it run, then stop it"],
      [50, "Several services"],
      [66, "Start them all"],
      [84, "Start just one, then open it"],
    ],
  },
  "edit-services": {
    seconds: 129,
    chapters: [
      [0, "Intro"],
      [28, "Edit a service"],
      [43, "Set the port"],
      [67, "Add a service"],
      [92, "Start both"],
      [108, "See it running"],
    ],
  },
  "add-action": {
    seconds: 141,
    chapters: [
      [0, "Intro"],
      [12, "Add an action"],
      [47, "Choose how it runs"],
      [70, "Run it"],
      [91, "Start from a suggestion"],
      [116, "Move, edit or delete"],
    ],
  },
  "switch-profiles": {
    seconds: 109,
    chapters: [
      [0, "Why profiles"],
      [31, "What a profile is"],
      [46, "Add a profile"],
      [68, "Switch profiles"],
      [84, "Switch back"],
    ],
  },
  "parallel-agents": {
    seconds: 112,
    chapters: [
      [0, "One folder, one agent at a time"],
      [19, "Duplicate the project"],
      [36, "Give each copy an agent and a task"],
      [57, "Create the copies"],
      [72, "Watch them side by side"],
      [86, "When they're done"],
    ],
  },
  "multiple-accounts": {
    seconds: 130,
    chapters: [
      [0, "Two Claude accounts on one Mac"],
      [22, "Add a second account"],
      [54, "Pick an account per project"],
      [67, "Two accounts at once"],
      [99, "Switch when one runs low"],
    ],
  },
  "accounts-switching": {
    seconds: 131,
    chapters: [
      [0, "Two accounts, one running low"],
      [27, "Turn on switching"],
      [53, "Turn order and the 90% rule"],
      [81, "Watch it switch"],
      [112, "When the week resets"],
    ],
  },
  "codex-statusline": {
    seconds: 124,
    chapters: [
      [0, "Intro"],
      [14, "The default status line"],
      [28, "Open the Codex status line settings"],
      [41, "Pick the Usage layout"],
      [60, "Make it yours"],
      [81, "See it in a new Codex session"],
      [102, "Watch it update"],
    ],
  },
  "claude-statusline": {
    seconds: 128,
    chapters: [
      [0, "Intro"],
      [12, "What Claude Code shows by default"],
      [32, "Turn on the status line"],
      [55, "How to read it"],
      [84, "Make it yours"],
      [98, "No restart needed"],
    ],
  },
  "review-code-changes": {
    seconds: 99,
    chapters: [
      [0, "Ask Claude for a change"],
      [31, "See every change in one view"],
      [52, "One file at a time"],
      [65, "Undo one file, commit the rest"],
    ],
  },
  "action-zones": {
    seconds: 159,
    chapters: [
      [0, "A header out of room"],
      [26, "Make a zone"],
      [68, "Add layers"],
      [115, "Fold it into one button"],
      [133, "Change or remove a zone"],
    ],
  },
  "connect-iphone": {
    seconds: 172,
    chapters: [
      [0, "Intro"],
      [11, "Turn on Remote control"],
      [27, "Set up Built-in Tailscale"],
      [76, "Pair the iPhone"],
      [100, "Run Claude Code from the iPhone"],
      [137, "Use it away from home"],
    ],
  },
  "create-an-automation": {
    seconds: 131,
    chapters: [
      [0, "Open the editor"],
      [18, "What it does"],
      [45, "Where it runs"],
      [73, "When it runs"],
      [89, "Run it now"],
    ],
  },
  "run-any-ai-coding-agent": {
    seconds: 80,
    chapters: [
      [0, "Claude Code and Codex, built in"],
      [17, "Add any agent as an action"],
      [35, "Run them side by side"],
      [54, "Every agent in the sidebar"],
    ],
  },
  "auto-pull-complete-guide": {
    seconds: 128,
    chapters: [
      [0, "Intro"],
      [13, "New commits"],
      [24, "Turn it on"],
      [48, "Undo a pull"],
      [66, "When it waits"],
      [89, "Choose which projects pull"],
    ],
  },
  "dynamic-action-labels": {
    seconds: 119,
    chapters: [
      [0, "Intro"],
      [13, "Variables in a label"],
      [49, "It updates by itself"],
      [67, "Show what a command prints"],
      [97, "When labels refresh"],
    ],
  },
  "share-terminal-in-browser": {
    seconds: 115,
    chapters: [
      [0, "Intro"],
      [10, "Share a tab"],
      [29, "Join from a browser"],
      [50, "Watch it live"],
      [69, "Let them type"],
      [88, "Stop sharing"],
    ],
  },
  "claude-code-codex-remote-server": {
    seconds: 120,
    chapters: [
      [0, "Two ways to add a server"],
      [38, "Connect the server"],
      [61, "Add a project on the server"],
      [75, "Claude Code and Codex on the server"],
    ],
  },
  "keep-agents-running-on-server": {
    seconds: 107,
    chapters: [
      [0, "Intro"],
      [11, "Why a server"],
      [22, "Connect the server"],
      [38, "Start the agents"],
      [56, "Close the laptop"],
      [75, "Come back"],
    ],
  },
  "automations-that-ask-you-first": {
    seconds: 136,
    chapters: [
      [0, "Intro"],
      [11, "Tell it when to ask"],
      [45, "It asks"],
      [80, "Answer with a click"],
      [97, "Answer in your own words"],
      [119, "Good to know"],
    ],
  },
  "run-agent-commands-in-one-click": {
    seconds: 82,
    chapters: [
      [0, "Intro"],
      [11, "Ask Claude Code"],
      [22, "Click to run"],
      [42, "Codex too"],
      [60, "Risky commands"],
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
  "stop-mac-sleeping-while-agents-run": {
    seconds: 126,
    chapters: [
      [0, "Intro"],
      [13, "The Keep awake menu"],
      [50, "While an agent works"],
      [85, "For a set time"],
      [105, "Until you turn it off"],
    ],
  },
  "switch-claude-account-mid-session": {
    seconds: 70,
    chapters: [
      [0, "Intro"],
      [11, "Start on one account"],
      [30, "Switch mid-turn"],
      [46, "Keep the conversation"],
    ],
  },
  "agents-other-computer": {
    seconds: 112,
    chapters: [
      [0, "Intro"],
      [10, "A session in progress"],
      [34, "Hand it off"],
      [62, "You approve each step"],
      [77, "Both at once"],
      [94, "Keep going there"],
    ],
  },
  "manage-claude-code-codex-skills": {
    seconds: 421,
    chapters: [
      [0, "Intro"],
      [15, "Open Skills"],
      [40, "Write a skill"],
      [86, "Run it in Claude Code"],
      [111, "The same skill in Codex"],
      [160, "Save a prompt as a skill"],
      [198, "Global skills"],
      [221, "Folders"],
      [251, "Skills made somewhere else"],
      [298, "Import old commands"],
      [314, "Find and pick skills"],
      [343, "Right-click a skill"],
      [384, "On your other devices"],
    ],
  },
  "organize-claude-code-codex-skills-folders": {
    seconds: 219,
    chapters: [
      [0, "Intro"],
      [24, "Make a folder"],
      [50, "Other ways to move skills"],
      [84, "Folders inside folders"],
      [108, "Skills you made elsewhere"],
      [131, "Keep it tidy"],
      [141, "Nothing moves on disk"],
      [157, "The slash menu"],
      [189, "On your other devices"],
    ],
  },
  "six-action-button-ideas": {
    seconds: 172,
    chapters: [
      [0, "Intro"],
      [28, "Bundle size"],
      [51, "Orders today"],
      [68, "Tests"],
      [81, "Server health"],
      [97, "Open issues"],
      [108, "Build one with Claude Code"],
    ],
  },
};
