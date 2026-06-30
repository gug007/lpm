import type { ComposerAction } from "./store/composerActions";

export const DEFAULT_GENERATOR_PROMPT_ACTIONS: ComposerAction[] = [
  {
    id: "improve",
    icon: "sparkles",
    label: "Improve",
    enabled: true,
    instruction:
      "Rewrite this into a clear, ordered, unambiguous set of steps for an AI coding agent scaffolding a new project from scratch in the current (empty) directory. Be explicit about the stack, tools, and exact commands to run; keep the original stack and intent; follow current best practices; do not invent requirements the user didn't imply.",
  },
  {
    id: "concise",
    icon: "minimize",
    label: "Make concise",
    enabled: true,
    instruction:
      "Rewrite this to be as short and direct as possible while preserving every setup step, tool, command, and requirement. Cut filler and repetition; keep all specifics.",
  },
  {
    id: "best-practices",
    icon: "list",
    label: "Add best practices",
    enabled: false,
    instruction:
      "Augment these scaffold instructions to follow current best practices for the chosen stack: a sensible project structure, TypeScript in strict mode where applicable, linting and formatting, a pre-commit hook, and a minimal working test setup with one example test. Keep the core stack the user chose and don't over-engineer.",
  },
  {
    id: "git",
    icon: "code",
    label: "Git & first commit",
    enabled: false,
    instruction:
      "Make sure the instructions initialize a git repository, add a .gitignore appropriate for the stack, and create an initial commit using conventional commits once the project builds and runs.",
  },
  {
    id: "minimal",
    icon: "zap",
    label: "Make minimal",
    enabled: false,
    instruction:
      "Strip this down to the smallest correct scaffold: just a working, runnable app of the chosen stack, with no extra tooling, dependencies, or files beyond what's required to run it.",
  },
  {
    id: "verify",
    icon: "list",
    label: "Verify it runs",
    enabled: false,
    instruction:
      "Add a final verification step: the agent must install dependencies, build, and start the app to confirm it actually works before finishing, and should prefer the latest stable versions of the framework and tooling.",
  },
];
