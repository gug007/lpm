import type { ReactNode } from "react";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

export type LessonStep = {
  title: string;
  blurb: string;
  body: ReactNode;
  lesson: YouTubeLessonId;
};

export const LESSON_STEPS: LessonStep[] = [
  {
    title: "Add a project",
    blurb: "Pick a folder or clone a repo. lpm fills in the dev servers it finds.",
    body: (
      <>
        Click <strong>+</strong>{" "}in the sidebar and pick a folder, or paste a
        Git URL and lpm clones it. lpm reads the project&rsquo;s own files and
        fills in the dev servers it finds — start commands, folders and ports
        — using built-in rules on your Mac, no&nbsp;AI.
      </>
    ),
    lesson: "add-project",
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
  },
  {
    title: "lpm in 60 seconds",
    blurb: "Start, stop and switch projects, then hand one to Claude Code.",
    body: (
      <>
        The whole loop in one take: start a project, stop it, switch to
        another, and open Claude Code from the project header with one click.
      </>
    ),
    lesson: "sixty-seconds",
  },
];
