import Link from "next/link";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { CONNECT_AGENTS_PATH, REVIEW_CHANGES_PATH } from "@/lib/links";

const LINK =
  "font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const ROWS: MatrixRow[] = [
  {
    label: "Start, stop and restart a project's services",
    lpm: "one click, or lpm service web restart",
    competitor: "not documented — you run the commands in a tab",
  },
  {
    label: "Bring up only the services one task needs",
    lpm: "a named profile per subset",
    competitor: "not documented",
  },
  {
    label: "Ports checked before the stack starts",
    lpm: "ask, free, or fail per service",
    competitor: "listening ports shown on the tab",
  },
  {
    label: "Saved commands for migrate, seed and lint",
    lpm: "a project button, or lpm run",
    competitor: "actions and custom commands in cmux.json",
  },
  {
    label: "Config that lives in the repo",
    lpm: ".lpm.yml you commit — services and profiles travel with the branch",
    competitor: "user-level cmux.json, plus .cmux/cmux.json per repo",
  },
  {
    label: "Drafts the config from your repo",
    lpm: "built in: package.json, Procfile, Gemfile, compose files and more, read when you add the repo; an AI redraft is optional",
    competitor: "you write it",
  },
  {
    label: "Isolated checkout per agent",
    lpm: "linked Git worktree or standalone copy",
    competitor: "not documented",
  },
  {
    label: "Fan one prompt out to N agents",
    lpm: "1–50 copies, the prompt queued on each",
    competitor: "no fan-out documented — one prompt per workspace",
  },
  {
    label: "Reports agent status back to the app",
    lpm: "Claude Code and Codex, via hooks lpm installs",
    competitor: "agent hooks, cmux notify, notification panel",
  },
  {
    label: "Agent CLIs it launches for you",
    lpm: "presets for Claude Code, Codex, Gemini CLI and OpenCode; any other CLI in a tab or as a one-click action",
    competitor:
      "the same four, plus Aider, Cline, Goose, Amp and anything you type in a tab",
  },
  {
    label: "Review the diff before you keep it",
    lpm: "side-by-side diff pane",
    competitor: "no diff view documented",
  },
  {
    label: "From changed files to an open pull request",
    lpm: "branch, commit, push and PR in one flow through the GitHub CLI, text drafted by your agent CLI; the PR link sits in the terminal footer",
    competitor: "branch and linked PR status in the sidebar; opening a PR is not documented",
  },
  {
    label: "Scriptable from outside the app",
    lpm: "the lpm CLI, with --json on nearly every verb",
    competitor: "cmux CLI + Unix socket",
  },
  {
    label: "Drive a browser from a script",
    lpm: "browser tabs, not scriptable",
    competitor: "snapshot, click, type, evaluate JS",
  },
  {
    label: "Terminal-emulator quality",
    lpm: "a terminal built for services and agents",
    competitor: "libghostty rendering, vertical tabs, splits",
  },
  {
    label: "Work on a remote machine",
    lpm: "SSH projects with port forwarding, or a paired Linux host driven from your Mac",
    competitor: "cmux ssh user@remote",
  },
  {
    label: "License, and what a paid tier buys",
    lpm: "MIT, nothing to buy",
    competitor:
      "GPL-3.0-or-later, commercial terms on request, a paid Founder's Edition for early access",
  },
];

export default function Matrix() {
  return (
    <FeatureMatrix
      id="matrix"
      title="cmux and lpm, row by row"
      description="Seventeen rows. Two go to cmux — the browser it can script and the emulator underneath it."
      competitorName="cmux"
      rows={ROWS}
      footnote={
        <>
          Two of lpm&apos;s rows have a page behind them:{" "}
          <Link href={CONNECT_AGENTS_PATH} className={LINK}>
            what the lpm CLI hands an agent
          </Link>{" "}
          and{" "}
          <Link href={REVIEW_CHANGES_PATH} className={LINK}>
            what the diff pane shows before you keep a change
          </Link>
          .
        </>
      }
    />
  );
}
