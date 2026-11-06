import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

type TopicId =
  | "get-started"
  | "buttons"
  | "agents"
  | "accounts"
  | "automations"
  | "devices";

type Topic = { id: TopicId; title: string; description: string };

const TOPICS: Topic[] = [
  {
    id: "get-started",
    title: "Get started",
    description: "Add a project, start its dev servers, and choose which ones run.",
  },
  {
    id: "buttons",
    title: "Buttons and actions",
    description: "Turn the commands you keep typing into buttons in the project header.",
  },
  {
    id: "agents",
    title: "AI coding agents and Git",
    description: "Run Claude Code, Codex and other agents side by side, then review and commit.",
  },
  {
    id: "accounts",
    title: "Claude accounts and limits",
    description: "Several Claude accounts on one computer, and statuslines that show what's left.",
  },
  {
    id: "automations",
    title: "Automations",
    description: "Prompts and commands that run on a schedule, and ask you when they need to.",
  },
  {
    id: "devices",
    title: "Servers, phones and other computers",
    description: "Keep agents running on a server, drive them from your iPhone, and share a terminal.",
  },
];

// Every lesson has to be filed here, so a new one can't be left off the page.
const LESSONS: Record<YouTubeLessonId, { topic: TopicId; title: string }> = {
  "lpm-in-3-minutes": { topic: "get-started", title: "lpm in 3 minutes" },
  "add-project": { topic: "get-started", title: "Add your first project" },
  "start-project": { topic: "get-started", title: "Start and stop your dev server" },
  "edit-services": { topic: "get-started", title: "Edit and add services" },
  "switch-profiles": { topic: "get-started", title: "Run only the services you need" },
  "add-action": { topic: "buttons", title: "Turn any command into a button" },
  "dynamic-action-labels": { topic: "buttons", title: "Buttons that show live info" },
  "action-popups-html-labels": { topic: "buttons", title: "Put charts on your buttons" },
  "action-zones": { topic: "buttons", title: "Stack buttons in rows and layers" },
  "run-any-ai-coding-agent": { topic: "agents", title: "Run any AI coding agent" },
  "parallel-agents": { topic: "agents", title: "Run agents in parallel copies" },
  "run-agent-commands-in-one-click": {
    topic: "agents",
    title: "Run an agent's commands in one click",
  },
  "review-code-changes": { topic: "agents", title: "Review code changes" },
  "auto-pull-complete-guide": { topic: "agents", title: "Pull from Git automatically" },
  "multiple-accounts": { topic: "accounts", title: "Several Claude Code accounts" },
  "accounts-switching": { topic: "accounts", title: "Switch accounts before a limit" },
  "switch-claude-account-mid-session": {
    topic: "accounts",
    title: "Switch accounts mid-session",
  },
  "claude-statusline": { topic: "accounts", title: "Claude Code statusline" },
  "codex-statusline": { topic: "accounts", title: "Codex statusline" },
  "create-an-automation": { topic: "automations", title: "Create an automation" },
  "automations-that-ask-you-first": {
    topic: "automations",
    title: "Automations that ask you first",
  },
  "connect-iphone": { topic: "devices", title: "Run Claude Code from your iPhone" },
  "claude-code-codex-remote-server": {
    topic: "devices",
    title: "Run agents on a remote server",
  },
  "keep-agents-running-on-server": {
    topic: "devices",
    title: "Keep agents running with the laptop shut",
  },
  "share-terminal-in-browser": { topic: "devices", title: "Share a terminal in a browser" },
  "sync-ignored-files": { topic: "devices", title: "Sync .env and other ignored files" },
  "stop-mac-sleeping-while-agents-run": {
    topic: "devices",
    title: "Keep your Mac awake while agents run",
  },
  "agents-other-computer": {
    topic: "devices",
    title: "Hand work to your other computer",
  },
  "manage-claude-code-codex-skills": {
    topic: "agents",
    title: "Manage skills in one place",
  },
  "organize-claude-code-codex-skills-folders": {
    topic: "agents",
    title: "Organize skills in folders",
  },
};

export type LessonCardData = { lesson: YouTubeLessonId; title: string };

export type LessonTopic = Topic & { lessons: LessonCardData[] };

const ENTRIES = Object.entries(LESSONS) as [
  YouTubeLessonId,
  (typeof LESSONS)[YouTubeLessonId],
][];

export const LESSON_TOPICS: LessonTopic[] = TOPICS.map((topic) => ({
  ...topic,
  lessons: ENTRIES.filter(([, entry]) => entry.topic === topic.id).map(
    ([lesson, { title }]) => ({ lesson, title }),
  ),
}));

export const LESSON_IDS = LESSON_TOPICS.flatMap((topic) =>
  topic.lessons.map(({ lesson }) => lesson),
);

export const ALL_LESSONS_MINUTES = Math.round(
  LESSON_IDS.reduce((sum, id) => sum + LESSON_CHAPTERS[id].seconds, 0) / 60,
);
