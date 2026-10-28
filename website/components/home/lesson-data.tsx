import type { ReactNode } from "react";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

export type LessonStep = {
  title: string;
  blurb: string;
  body: ReactNode;
  lesson: YouTubeLessonId;
  // A frame from the lesson itself, for its row and the player's poster: the
  // YouTube thumbnails are all the same title card, so they can't tell the
  // lessons apart and show no app.
  thumbnail: string;
  seconds: number;
};

// The overview leads: a newcomer wants the whole loop before the how-tos.
export const LESSON_STEPS: LessonStep[] = [
  {
    title: "lpm in 3 minutes",
    blurb: "Your dev servers, Claude Code and Codex in one window.",
    body: (
      <>
        The whole tour in one take: start a stack in one click, free a busy
        port, ask Claude Code and Codex side by side, run agents in parallel
        copies, then review and commit the best result.
      </>
    ),
    lesson: "lpm-in-3-minutes",
    thumbnail: "/lessons/lpm-in-3-minutes.jpg",
    seconds: 199,
  },
  {
    title: "Add a project",
    blurb: "Pick a folder or clone a repo. lpm fills in the dev servers it finds.",
    body: (
      <>
        Click <strong>+</strong>{" "}in the sidebar and pick a folder, or paste a
        Git URL and lpm clones it. lpm reads the project&rsquo;s own files and
        fills in the dev servers it finds — start commands, folders and ports
        — using built-in rules on your computer, no&nbsp;AI.
      </>
    ),
    lesson: "add-project",
    thumbnail: "/lessons/add-project.jpg",
    seconds: 147,
  },
  {
    title: "Start a project",
    blurb: "Every service boots with live output in a tab of its own.",
    body: (
      <>
        Click <strong>Start</strong>{" "}and the project&rsquo;s services boot.
        Each one streams live output in its own tab, or put them all side by
        side in one view.
      </>
    ),
    lesson: "start-project",
    thumbnail: "/lessons/start-project.jpg",
    seconds: 115,
  },
  {
    title: "Add an action",
    blurb: "Turn tests, migrations and deploys into one-click buttons.",
    body: (
      <>
        Turn a linter, test run, migration or deploy script into an action. It
        shows up as a button in the project, so running it takes one click and
        you never leave the app.
      </>
    ),
    lesson: "add-action",
    thumbnail: "/lessons/add-action.jpg",
    seconds: 126,
  },
  {
    title: "Switch between profiles",
    blurb: "Boot only the services you need right now.",
    body: (
      <>
        Save named sets of services — <strong>default</strong>{" "}for everyday
        work, <strong>full</strong>{" "}when you need everything — and pick one
        from the Start menu to boot only that set.
      </>
    ),
    lesson: "switch-profiles",
    thumbnail: "/lessons/switch-profiles.jpg",
    seconds: 107,
  },
  {
    title: "Run Claude Code and Codex in parallel",
    blurb: "Duplicate the project so each agent works in its own copy.",
    body: (
      <>
        Duplicate a project into standalone copies — near-instant on APFS — or
        into Git worktrees. Each copy has its own folder, terminals and agents,
        so Claude Code and Codex can take separate tasks without touching each
        other&rsquo;s files.
      </>
    ),
    lesson: "parallel-agents",
    thumbnail: "/lessons/parallel-agents.jpg",
    seconds: 110,
  },
];

// The three-minute tour, which leads the series.
export const OVERVIEW_LESSON = LESSON_STEPS[0];

export function formatLength(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const LESSONS_TOTAL_MINUTES = Math.round(
  LESSON_STEPS.reduce((sum, step) => sum + step.seconds, 0) / 60,
);

// A lesson's own frame for a player that stands in for something else, such
// as the demo on a phone. Lessons without a frame keep YouTube's thumbnail.
export function lessonPoster(lesson: YouTubeLessonId) {
  const step = LESSON_STEPS.find((s) => s.lesson === lesson);
  if (!step) return undefined;
  const kind = step === LESSON_STEPS[0] ? "Three-minute tour" : "Lesson";
  return {
    src: step.thumbnail,
    label: `${kind} · ${formatLength(step.seconds)}`,
    title: step.title,
  };
}
