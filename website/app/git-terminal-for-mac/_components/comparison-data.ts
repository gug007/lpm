export type AlternativeKey = "lpm" | "gitKraken" | "iterm2" | "terminal" | "tmux" | "sourceTree";

export type Cell = boolean | string;

export type Capability = {
  label: string;
} & Record<AlternativeKey, Cell>;

export const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "gitKraken", label: "GitKraken" },
  { key: "iterm2", label: "iTerm2" },
  { key: "terminal", label: "Terminal.app" },
  { key: "tmux", label: "tmux" },
  { key: "sourceTree", label: "SourceTree" },
];

export const CAPABILITIES: Capability[] = [
  {
    label: "Built-in diff review and commit dialog",
    lpm: true,
    gitKraken: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    sourceTree: true,
  },
  {
    label: "Full-stack stop and start after a rebase or merge",
    lpm: true,
    gitKraken: false,
    iterm2: false,
    terminal: false,
    tmux: false,
    sourceTree: false,
  },
  {
    label: "Services detected from the repo when you add it",
    lpm: true,
    gitKraken: false,
    iterm2: false,
    terminal: false,
    tmux: false,
    sourceTree: false,
  },
  {
    label: "Every repo in one sidebar, each with its running services",
    lpm: true,
    gitKraken: false,
    iterm2: false,
    terminal: false,
    tmux: false,
    sourceTree: false,
  },
  {
    label: "Free",
    lpm: true,
    gitKraken: "Local and public repos",
    iterm2: true,
    terminal: true,
    tmux: true,
    sourceTree: true,
  },
  {
    label: "Open source",
    lpm: true,
    gitKraken: false,
    iterm2: true,
    terminal: false,
    tmux: true,
    sourceTree: false,
  },
];
