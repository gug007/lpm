export const YOUTUBE_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLGgzBw1aFVk8";

const LESSONS = {
  "add-project": {
    id: "DBKZvb_-Cb4",
    name: "Add Your First Project: Pick a Folder or Clone a Repository",
    description:
      "Adding a project in the lpm desktop app: click + in the sidebar, pick a local folder or clone a Git repository, and the project appears ready to start.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "start-project": {
    id: "ysllvZN9Flo",
    name: "Start and Stop Your Dev Server in lpm: No Config, Just Click Start",
    description:
      "Starting and stopping a project in lpm: every service launches in parallel with live terminal output side by side.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "edit-services": {
    id: "2QUy7XbPaB0",
    name: "Edit and Add Services in lpm",
    description:
      "Editing a service and adding a second one to a project in lpm, then starting both with one click.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "add-action": {
    id: "3MJaCcsV-8E",
    name: "Add an Action in lpm: Turn Any Command Into a One-Click Button",
    description:
      "Adding a one-shot action to a project in lpm — linters, test runners, or deploy scripts become buttons you trigger without leaving the app.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "switch-profiles": {
    id: "qFdoN4-yFqY",
    name: "Switch Between Profiles in lpm: Run Only the Services You Need",
    description:
      "Defining profiles in lpm and switching between subsets of services with the profile switcher in the header.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "parallel-agents": {
    id: "6NsF8xBY9m4",
    name: "Run Agents in Parallel in lpm: Duplicate Your Project into Two, Three, or More Copies",
    description:
      "Duplicating a project in lpm into standalone copies, each with its own terminals and an AI agent working on the same prompt.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
  "multiple-accounts": {
    id: "zLt_56dvOsg",
    name: "Use Multiple Claude Code Accounts on One Mac",
    description:
      "Adding a second Claude Code account in lpm, picking which account each project uses from its menu, and switching a project to the account with room left when one hits its 5-hour or weekly limit.",
    uploadDate: "2026-09-25T09:00:00+00:00",
  },
  "codex-statusline": {
    id: "TO3yguc3qAM",
    name: "Codex Statusline: Show Usage Limits and Context Left in lpm",
    description:
      "Setting up the Codex CLI status line in lpm: pick the Usage layout, remove what you don't need, and new Codex sessions show the context left and 5-hour and weekly limits under the prompt.",
    uploadDate: "2026-09-24T09:00:00+00:00",
  },
  "claude-statusline": {
    id: "y_qaWmCl1IE",
    name: "Claude Code Statusline: Show Usage Limits and Context Left in lpm",
    description:
      "Adding a Claude Code status line in lpm: pick the Clean layout, remove the cost, and the running Claude session shows the context left and 5-hour and weekly limits under the prompt with no restart.",
    uploadDate: "2026-09-25T09:00:00+00:00",
  },
  "review-code-changes": {
    id: "_eFQc4O6-Js",
    name: "Review Code Changes in the lpm Terminal",
    description:
      "Claude Code edits your files; lpm shows you every change before it's committed, in a diff view right next to the terminal.",
    uploadDate: "2026-09-30T09:00:00+00:00",
  },
  "sixty-seconds": {
    id: "H46vW5DPbZk",
    name: "lpm in 60 Seconds: Start, Stop, Switch Projects and Run AI Agents",
    description:
      "A one-minute tour of lpm: start and stop a project, switch to another, and hand it to Claude Code from the header.",
    uploadDate: "2026-09-19T09:00:00+00:00",
  },
} as const;

export type YouTubeLessonId = keyof typeof LESSONS;

export type YouTubeLesson = (typeof LESSONS)[YouTubeLessonId];

export const youtubeLesson = (id: YouTubeLessonId): YouTubeLesson =>
  LESSONS[id];

export const youtubeWatchUrl = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${videoId}`;

export const youtubeEmbedUrl = (videoId: string): string =>
  `https://www.youtube-nocookie.com/embed/${videoId}`;

export const youtubeThumbnailUrl = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
