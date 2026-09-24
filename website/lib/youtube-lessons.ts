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
