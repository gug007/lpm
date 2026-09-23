export type AlternativeKey = "lpm" | "iterm2" | "terminal" | "tmux" | "hyper" | "warp";

export type Capability = {
  label: string;
} & Record<AlternativeKey, boolean>;

export const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "iterm2", label: "iTerm2" },
  { key: "terminal", label: "Terminal.app" },
  { key: "tmux", label: "tmux" },
  { key: "hyper", label: "Hyper" },
  { key: "warp", label: "Warp" },
];

export const CAPABILITIES: Capability[] = [
  {
    label: "Native Apple Silicon build, no Electron runtime",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    hyper: false,
    warp: true,
  },
  {
    label: "Free",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    hyper: true,
    warp: true,
  },
  {
    label: "Open source",
    lpm: true,
    iterm2: true,
    terminal: false,
    tmux: true,
    hyper: true,
    warp: true,
  },
  {
    label: "Visual project switcher with live state",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Built-in project-aware full-stack start",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Built-in service definitions with live output",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Sets up your services from the repo's manifests",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Claude Code and Codex side by side, each in its own copy",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Project setup you edit inside the app",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
];
