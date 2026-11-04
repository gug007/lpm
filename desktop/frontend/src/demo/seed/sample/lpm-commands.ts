import type { Seed } from "../types";

// The prompts a sample workspace keeps as lpm skills: a few everyday ones
// for every project, and a couple each project keeps in its own folder.
export const SAMPLE_LPM_COMMANDS: NonNullable<Seed["lpmCommands"]> = {
  global: [
    {
      name: "commit-parts",
      folder: "Git",
      description: "Small conventional commits, no push",
      body: "Split my changes into small conventional commits, one concern per commit. Do not push.",
    },
    {
      name: "write-tests",
      folder: "Testing",
      description: "Tests for what I just changed",
      body: "Write focused tests for the code I just changed, run them, and fix anything that fails.",
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
    },
    {
      name: "fix-ticket",
      folder: "Bugs",
      description: "Fix a ticket on the current branch",
      body: "Fix {{ticket}} on branch {{branch}}. Read the issue first and tell me your plan before editing. Keep the diff small and add a test.",
    },
  ],
};
