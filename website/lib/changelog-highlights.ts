import { formatLength } from "@/components/home/lesson-data";
import type { ChangelogDay } from "./changelog-days";
import { lessonPath } from "./links";
import { LESSON_CHAPTERS } from "./youtube-chapters";
import {
  youtubeLesson,
  youtubeThumbnailUrl,
  type YouTubeLessonId,
} from "./youtube-lessons";

// A pick is shown with its lesson's cover, or with `cover` as a few words in
// its place when no lesson covers the change.
type Pick = { version: string; title: string } & (
  | { lesson: YouTubeLessonId; cover?: never }
  | { cover: string; lesson?: never }
);

// The four changes that mattered most in each month, newest first, each named
// by the release that shipped it. A month without an entry shows no strip, so
// add one when a month ends.
const PICKS: Record<string, Pick[]> = {
  "2026-11": [
    {
      version: "0.7.62",
      title: "Archive projects and get the disk space back",
      lesson: "archive-projects",
    },
    {
      version: "0.7.59",
      title: "lpm Link for Android is on Google Play",
      cover: "Android app on Google Play",
    },
    {
      version: "0.7.51",
      title: "CI alerts with one-click reruns and agent fixes",
      cover: "CI check alerts",
    },
    {
      version: "0.7.49",
      title: "Switch a tab to another Claude account mid-session",
      lesson: "switch-claude-account-mid-session",
    },
  ],
  "2026-10": [
    {
      version: "0.7.43",
      title: "Sync files between paired computers, ignored ones included",
      lesson: "sync-ignored-files",
    },
    {
      version: "0.7.30",
      title: "Automations can ask you a question and wait",
      lesson: "automations-that-ask-you-first",
    },
    {
      version: "0.7.26",
      title: "Share a terminal tab with anyone, in a browser",
      lesson: "share-terminal-in-browser",
    },
    {
      version: "0.6.11",
      title: "lpm for Windows and Linux, in beta",
      cover: "Windows and Linux beta",
    },
  ],
  "2026-09": [
    {
      version: "0.5.79",
      title: "Schedule a prompt to send later",
      cover: "Send later",
    },
    {
      version: "0.5.75",
      title: "Automatic pull requests, with the PR linked in the footer",
      cover: "Automatic pull requests",
    },
    {
      version: "0.5.73",
      title: "Services are detected when you add or clone a project",
      lesson: "start-project",
    },
    {
      version: "0.5.69",
      title: "A file browser for every project",
      cover: "Files tab",
    },
  ],
  "2026-08": [
    {
      version: "0.5.55",
      title: "Edit skills, or have AI write them",
      lesson: "manage-claude-code-codex-skills",
    },
    {
      version: "0.5.46",
      title: "Terminals run in lpm’s own service, with nothing extra to install",
      cover: "Nothing extra to install",
    },
    {
      version: "0.5.36",
      title: "Usage meters you can set up in the sidebar",
      cover: "Usage meters",
    },
    {
      version: "0.5.27",
      title: "Replies read aloud, highlighted as they’re spoken",
      cover: "Read aloud",
    },
  ],
  "2026-07": [
    {
      version: "0.5.15",
      title: "Linux hosts: run lpm on a server and drive it from your Mac",
      lesson: "claude-code-codex-remote-server",
    },
    {
      version: "0.4.96",
      title: "Automations: agent jobs on a schedule",
      lesson: "create-an-automation",
    },
    {
      version: "0.4.78",
      title: "Several Claude Code accounts, one pinned to each project",
      lesson: "multiple-accounts",
    },
    {
      version: "0.4.74",
      title: "lpm Link, the iPhone companion app",
      lesson: "connect-iphone",
    },
  ],
  "2026-06": [
    {
      version: "0.4.55",
      title: "Review staged and branch changes, and edit in the diff",
      lesson: "review-code-changes",
    },
    {
      version: "0.4.46",
      title: "Mentions and slash commands in the composer",
      cover: "@ mentions and / commands",
    },
    {
      version: "0.4.36",
      title: "The composer: a real text box for agent prompts",
      cover: "The composer",
    },
    {
      version: "0.4.32",
      title: "Project folders in the sidebar",
      cover: "Sidebar folders",
    },
  ],
  "2026-05": [
    {
      version: "0.4.0",
      title: "A rebuilt, faster app with a browser tab inside panes",
      cover: "A rebuilt, faster app",
    },
    {
      version: "0.3.53",
      title: "Open a project in its own window",
      cover: "Project windows",
    },
    {
      version: "0.3.42",
      title: "Layered configs: a shared setup plus your own settings",
      cover: "Layered configs",
    },
    {
      version: "0.3.38",
      title: "Clone a Git repository as a new project",
      lesson: "add-project",
    },
  ],
  "2026-04": [
    {
      version: "0.3.15",
      title: "SSH projects: run services and actions on another machine",
      cover: "SSH projects",
    },
    {
      version: "0.1.117",
      title: "Duplicate a project into a copy under the original",
      lesson: "parallel-agents",
    },
    {
      version: "0.1.79",
      title: "Agent status in the sidebar for Claude Code and Codex",
      cover: "Agent status",
    },
    {
      version: "0.1.26",
      title: "Actions: run a project’s commands from a button",
      lesson: "add-action",
    },
  ],
  "2026-03": [
    {
      version: "0.1.21",
      title: "A Settings screen, and updates from inside the app",
      cover: "In-app updates",
    },
    {
      version: "0.1.16",
      title: "The macOS app is signed and notarized",
      cover: "Signed and notarized",
    },
    {
      version: "0.1.10",
      title: "The first desktop app",
      cover: "The desktop app",
    },
    {
      version: "0.1.0",
      title: "The first release: a command-line tool for local dev projects",
      cover: "v0.1.0",
    },
  ],
};

export type MonthHighlight = {
  version: string;
  date: string;
  title: string;
  href: string;
  lesson?: { thumbnail: string; length: string };
  cover?: string;
};

// A pick whose release isn't in the month's days is left out rather than
// shown with a date it never had.
export function monthHighlights(
  month: string,
  days: ChangelogDay[],
): MonthHighlight[] {
  return (PICKS[month] ?? []).flatMap((pick): MonthHighlight[] => {
    const day = days.find(({ releases }) =>
      releases.some((release) => release.version === pick.version),
    );
    if (!day) return [];
    const { version, title } = pick;
    const base = { version, title, date: day.date };
    if (!pick.lesson) {
      return [{ ...base, href: `#v${version}`, cover: pick.cover }];
    }
    return [
      {
        ...base,
        href: lessonPath(pick.lesson),
        lesson: {
          thumbnail: youtubeThumbnailUrl(youtubeLesson(pick.lesson).id),
          length: formatLength(LESSON_CHAPTERS[pick.lesson].seconds),
        },
      },
    ];
  });
}
