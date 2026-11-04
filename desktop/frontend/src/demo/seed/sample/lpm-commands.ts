import type { Seed } from "../types";
import { DAY, HOUR, MINUTE } from "./clock";

// The prompts a sample workspace keeps as lpm skills: a few everyday ones
// for every project, and a couple each project keeps in its own folder.
export const SAMPLE_LPM_COMMANDS: NonNullable<Seed["lpmCommands"]> = {
  global: [
    {
      name: "commit-parts",
      folder: "Git",
      description: "Small conventional commits, no push",
      body: "Split my changes into small conventional commits, one concern per commit. Do not push.",
      runs: 23,
      ranAgo: 2 * HOUR,
    },
    {
      name: "write-tests",
      folder: "Testing",
      description: "Tests for what I just changed",
      body: "Write focused tests for the code I just changed, run them, and fix anything that fails.",
      runs: 2,
      ranAgo: 9 * DAY,
    },
    {
      name: "explain",
      folder: null,
      description: "Explain a piece of code",
      body: "Explain what $ARGUMENTS does, where it is called from, and what would break if it changed.",
    },
  ],
  project: [
    {
      name: "review-changes",
      folder: "Review",
      description: "Bugs and gaps in my uncommitted changes",
      body: "Review my uncommitted changes for bugs, missing edge cases and untested paths. List blocking issues first.",
      runs: 11,
      ranAgo: 40 * MINUTE,
    },
    {
      name: "fix-ticket",
      folder: "Bugs",
      description: "Fix a ticket on the current branch",
      body: "Fix {{ticket}} on branch {{branch}}. Read the issue first and tell me your plan before editing. Keep the diff small and add a test.",
      runs: 4,
      ranAgo: 3 * DAY,
    },
  ],
  others: {
    global: [
      {
        name: "find-docs",
        description: "Look up current docs for a library",
        preview: "Find the official docs for the library in question and quote the relevant section.",
        agents: ["claude", "codex", "gemini", "opencode"],
        path: "~/.agents/skills/find-docs/SKILL.md",
      },
      {
        name: "playwright-cli",
        description: "Drive a browser to test a page",
        preview: "Open the page in a browser, follow the steps and report what you see.",
        agents: ["claude", "opencode"],
        path: "~/.claude/skills/playwright-cli/SKILL.md",
      },
      {
        name: "testflight-upload",
        description: "Upload a build to TestFlight",
        preview: "Archive the app, upload it to TestFlight and report the build number.",
        agents: ["codex"],
        path: "~/.codex/skills/testflight-upload/SKILL.md",
      },
    ],
    project: [
      {
        name: "db-migrate",
        description: "Write and run a database migration",
        preview: "Write a migration for the change, run it locally and show the schema diff.",
        agents: ["codex", "gemini", "opencode"],
        path: ".agents/skills/db-migrate/SKILL.md",
      },
      {
        name: "deploy-preview",
        description: "Deploy the current branch to a preview URL",
        preview: "Build the app, deploy it to a preview URL and post the link.",
        agents: ["claude", "opencode"],
        path: ".claude/skills/deploy-preview/SKILL.md",
      },
    ],
  },
};
