export type ToolKey =
  | "lpm"
  | "iterm2"
  | "tmux"
  | "cmux"
  | "compose"
  | "foreman"
  | "overmind"
  | "pm2";

export type ToolCell = boolean | string;

export type ToolColumn = {
  key: ToolKey;
  label: string;
};

export type ToolRow = { label: string } & Record<ToolKey, ToolCell>;

export const TOOL_COLUMNS: ToolColumn[] = [
  { key: "lpm", label: "lpm" },
  { key: "iterm2", label: "iTerm2" },
  { key: "tmux", label: "tmux" },
  { key: "cmux", label: "cmux" },
  { key: "compose", label: "Docker Compose" },
  { key: "foreman", label: "Foreman" },
  { key: "overmind", label: "Overmind" },
  { key: "pm2", label: "PM2" },
];

export const TOOL_ROWS: ToolRow[] = [
  {
    label: "Has a desktop app, not just a command line",
    lpm: true,
    iterm2: true,
    tmux: false,
    cmux: true,
    compose: "Docker Desktop",
    foreman: false,
    overmind: false,
    pm2: false,
  },
  {
    label: "One live pane per process, no scripting",
    lpm: true,
    iterm2: "you split them",
    tmux: "you script it",
    cmux: "you script it",
    compose: "interleaved",
    foreman: "interleaved",
    overmind: "one tmux window each",
    pm2: "pm2 logs",
  },
  {
    label: "Many repos as switchable projects",
    lpm: true,
    iterm2: "profiles",
    tmux: "sessions",
    cmux: "workspaces",
    compose: false,
    foreman: false,
    overmind: false,
    pm2: false,
  },
  {
    label: "Restart one process without the rest",
    lpm: true,
    iterm2: false,
    tmux: "respawn by hand",
    cmux: false,
    compose: true,
    foreman: false,
    overmind: true,
    pm2: true,
  },
  {
    label: "Brings a crashed process back on its own",
    lpm: false,
    iterm2: false,
    tmux: false,
    cmux: false,
    compose: "with a restart policy",
    foreman: false,
    overmind: "start -r",
    pm2: true,
  },
  {
    label: "Works out the services from package.json, Gemfile or go.mod",
    lpm: "built in, when you add the folder",
    iterm2: false,
    tmux: false,
    cmux: false,
    compose: false,
    foreman: false,
    overmind: false,
    pm2: false,
  },
  {
    label: "Duplicates the project for a second agent",
    lpm: "worktree or full copy, 1–50",
    iterm2: false,
    tmux: false,
    cmux: false,
    compose: false,
    foreman: false,
    overmind: false,
    pm2: false,
  },
  {
    label: "Says whether an agent is working, needs you or done",
    lpm: "Claude Code, Codex",
    iterm2: "Claude Code, since 3.7",
    tmux: false,
    cmux: "when it needs you",
    compose: false,
    foreman: false,
    overmind: false,
    pm2: false,
  },
  {
    label: "Runs services natively, no containers",
    lpm: true,
    iterm2: true,
    tmux: true,
    cmux: true,
    compose: false,
    foreman: true,
    overmind: true,
    pm2: true,
  },
  {
    label: "Services survive quitting the app",
    lpm: true,
    iterm2: "only via tmux",
    tmux: true,
    cmux: "reopens panes",
    compose: "detached",
    foreman: false,
    overmind: true,
    pm2: true,
  },
  {
    label: "Reads a Procfile or compose file you already have",
    lpm: "once, when you add the folder",
    iterm2: false,
    tmux: false,
    cmux: false,
    compose: "its compose file, every start",
    foreman: "the Procfile, every start",
    overmind: "the Procfile, every start",
    pm2: false,
  },
  {
    label: "Available outside macOS",
    lpm: "macOS only",
    iterm2: false,
    tmux: "Linux, *BSD",
    cmux: false,
    compose: "Linux, Windows",
    foreman: "Linux",
    overmind: "Linux, *BSD",
    pm2: "Linux, Windows",
  },
  {
    label: "Free and open source",
    lpm: "MIT",
    iterm2: "GPLv2",
    tmux: true,
    cmux: "GPL-3.0-or-later",
    compose: "Apache-2.0",
    foreman: true,
    overmind: "MIT",
    pm2: true,
  },
];
