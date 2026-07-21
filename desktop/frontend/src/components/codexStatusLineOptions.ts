import type { CodexStatusLineAccent } from "./codexStatusLineColors";

export type CodexStatusLineGroup =
  | "Model & activity"
  | "Project"
  | "Context & limits"
  | "Session & access";

export interface CodexStatusLineOption {
  id: string;
  label: string;
  description: string;
  preview: string;
  group: CodexStatusLineGroup;
  accent: CodexStatusLineAccent;
}

export const CODEX_DEFAULT_STATUS_LINE = [
  "model-with-reasoning",
  "current-dir",
] as const;

export const CODEX_STATUS_LINE_GROUPS: CodexStatusLineGroup[] = [
  "Model & activity",
  "Project",
  "Context & limits",
  "Session & access",
];

export const CODEX_STATUS_LINE_OPTIONS: CodexStatusLineOption[] = [
  {
    id: "model",
    label: "Model",
    description: "Current model name",
    preview: "gpt-5.2-codex",
    group: "Model & activity",
    accent: "model",
  },
  {
    id: "model-with-reasoning",
    label: "Model + reasoning",
    description: "Current model name with reasoning level",
    preview: "gpt-5.2-codex medium",
    group: "Model & activity",
    accent: "model",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Current reasoning level",
    preview: "medium",
    group: "Model & activity",
    accent: "model",
  },
  {
    id: "run-state",
    label: "Run state",
    description: "Compact session state such as Ready, Working, or Thinking",
    preview: "Working",
    group: "Model & activity",
    accent: "state",
  },
  {
    id: "fast-mode",
    label: "Fast mode",
    description: "Whether Fast mode is currently active",
    preview: "Fast on",
    group: "Model & activity",
    accent: "mode",
  },
  {
    id: "raw-output",
    label: "Raw output",
    description: "Shown when raw scrollback mode is active",
    preview: "raw output",
    group: "Model & activity",
    accent: "mode",
  },
  {
    id: "task-progress",
    label: "Task progress",
    description: "Latest checklist progress from update_plan",
    preview: "Tasks 3/4",
    group: "Model & activity",
    accent: "progress",
  },
  {
    id: "current-dir",
    label: "Current directory",
    description: "Current working directory",
    preview: "~/my-project/subdir",
    group: "Project",
    accent: "path",
  },
  {
    id: "project-name",
    label: "Project name",
    description: "Project name when available",
    preview: "my-project",
    group: "Project",
    accent: "path",
  },
  {
    id: "git-branch",
    label: "Git branch",
    description: "Current Git branch when available",
    preview: "feat/awesome-feature",
    group: "Project",
    accent: "branch",
  },
  {
    id: "pull-request-number",
    label: "Pull request",
    description: "Open pull request number for the current branch",
    preview: "PR #123",
    group: "Project",
    accent: "branch",
  },
  {
    id: "branch-changes",
    label: "Branch changes",
    description: "Committed changes against the default branch",
    preview: "+12 -3",
    group: "Project",
    accent: "branch",
  },
  {
    id: "context-remaining",
    label: "Context remaining",
    description: "Percentage of the context window remaining",
    preview: "Context 72% left",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "context-used",
    label: "Context used",
    description: "Percentage of the context window used",
    preview: "Context 28% used",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "context-window-size",
    label: "Context size",
    description: "Total context window size in tokens",
    preview: "272K window",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "five-hour-limit",
    label: "Primary limit",
    description: "Remaining usage on the primary usage limit",
    preview: "5h 66% left",
    group: "Context & limits",
    accent: "limit",
  },
  {
    id: "weekly-limit",
    label: "Secondary limit",
    description: "Remaining usage on the secondary usage limit",
    preview: "weekly 38% left",
    group: "Context & limits",
    accent: "limit",
  },
  {
    id: "used-tokens",
    label: "Tokens used",
    description: "Total tokens used in this session",
    preview: "76.2K used",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "total-input-tokens",
    label: "Input tokens",
    description: "Total input tokens used in this session",
    preview: "70.8K in",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "total-output-tokens",
    label: "Output tokens",
    description: "Total output tokens used in this session",
    preview: "5.4K out",
    group: "Context & limits",
    accent: "usage",
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "Active permission profile or sandbox mode",
    preview: "Workspace",
    group: "Session & access",
    accent: "mode",
  },
  {
    id: "approval-mode",
    label: "Approval mode",
    description: "Active command approval mode",
    preview: "on-request",
    group: "Session & access",
    accent: "mode",
  },
  {
    id: "thread-title",
    label: "Thread title",
    description: "Current thread title or identifier when unnamed",
    preview: "Status line builder",
    group: "Session & access",
    accent: "thread",
  },
  {
    id: "thread-id",
    label: "Thread ID",
    description: "Current thread identifier",
    preview: "550e8400-e29b-41d4",
    group: "Session & access",
    accent: "metadata",
  },
  {
    id: "codex-version",
    label: "Codex version",
    description: "Codex application version",
    preview: "0.144.6",
    group: "Session & access",
    accent: "metadata",
  },
  {
    id: "workspace-headline",
    label: "Workspace headline",
    description: "Enterprise workspace notification headline",
    preview: "Workspace headline",
    group: "Session & access",
    accent: "thread",
  },
];

const OPTIONS_BY_ID = new Map(
  CODEX_STATUS_LINE_OPTIONS.map((option) => [option.id, option]),
);

const LEGACY_IDS = new Map([
  ["model-name", "model"],
  ["project", "project-name"],
  ["project-root", "project-name"],
  ["status", "run-state"],
  ["approval", "approval-mode"],
  ["context-usage", "context-used"],
  ["session-id", "thread-id"],
]);

export function canonicalCodexStatusLineId(id: string): string {
  return LEGACY_IDS.get(id) ?? id;
}

export function codexStatusLineOption(id: string): CodexStatusLineOption {
  return (
    OPTIONS_BY_ID.get(canonicalCodexStatusLineId(id)) ?? {
      id,
      label: id,
      description: "Preserved for a newer Codex version",
      preview: "",
      group: "Session & access",
      accent: "metadata",
    }
  );
}
