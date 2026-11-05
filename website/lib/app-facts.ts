// What the app is and does, said once for the structured data and /llms.txt.
export const APP_DESCRIPTION =
  "A free, open-source desktop app for macOS, Windows and x86-64 Linux that starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running Claude Code, Codex, and other AI coding agents in parallel.";

export const OPERATING_SYSTEMS =
  "macOS 12 or later, Windows 11 (x64), Linux (x86-64, glibc 2.35 or later)";

// The agents that report Working, Needs you and Done to lpm on their own: the
// status hooks in desktop/frontend/src-tauri/src/hooks/mod.rs. Claude Code and
// Codex lead because they also get resume, fork and the model picker.
export const STATUS_AGENTS = [
  "Claude Code",
  "Codex",
  "Gemini CLI",
  "Cursor CLI",
  "OpenCode",
  "omp",
] as const;

export function listNames(names: readonly string[], conjunction = "and"): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

export const STATUS_AGENT_NAMES = listNames(STATUS_AGENTS);
export const STATUS_AGENT_CHOICES = listNames(STATUS_AGENTS, "or");
export const OTHER_STATUS_AGENT_NAMES = listNames(STATUS_AGENTS.slice(2));

export const FEATURE_LIST = [
  "Detects a project's dev servers when you add or clone it",
  "One-click start and stop for every service, with profiles",
  "Live output per service with listening ports and port-conflict checks",
  "Built-in terminals with Claude Code, Codex, Gemini, and OpenCode launchers",
  `Live ${STATUS_AGENT_NAMES} status with sounds and system notifications`,
  "Prompt composer with @ mentions, images, and slash-command autocomplete",
  "Duplicate a project or create Git worktrees to run agents in parallel",
  "Scheduled automations that run agent prompts, commands, or actions",
  "Review changes, AI commit messages, and GitHub pull requests",
  "Files tab with an editor, Git status, and editable diffs",
  "Claude Code and Codex token stats and plan-limit meters",
  "Multiple Claude Code accounts pinned per project",
  "SSH remote projects with port forwarding",
  "Control another computer running lpm or a Linux server from the app",
  "iPhone companion with live terminals and push notifications",
  "lpm CLI and agent skills so coding agents can drive lpm",
];
