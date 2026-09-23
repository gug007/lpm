export type AlternativeKey = "lpm" | "iterm2" | "terminal" | "tmux" | "warp" | "vsCode";

export type Cell = boolean | string;

export type Capability = {
  label: string;
} & Record<AlternativeKey, Cell>;

export const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "iterm2", label: "iTerm2" },
  { key: "terminal", label: "Terminal.app" },
  { key: "tmux", label: "tmux" },
  { key: "warp", label: "Warp" },
  { key: "vsCode", label: "VS Code terminal" },
];

export const CAPABILITIES: Capability[] = [
  {
    label: "One click starts every service, each in its own log pane",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: "Scripted",
    warp: "Launch config",
    vsCode: "Via tasks",
  },
  {
    label: "Stop or restart one service while the rest keep running",
    lpm: true,
    iterm2: "By hand",
    terminal: "By hand",
    tmux: "By hand",
    warp: "By hand",
    vsCode: true,
  },
  {
    label: "Listening ports shown on each service",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Each monorepo app detected as its own service",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: "npm scripts",
  },
  {
    label: "Remote services with their ports forwarded to localhost",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: "Remote-SSH",
  },
];
