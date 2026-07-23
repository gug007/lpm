export type Platform = "claude" | "codex";
export type ClaudeColorId =
  | "claude"
  | "cyan"
  | "green"
  | "yellow"
  | "magenta"
  | "blue"
  | "default"
  | "dim";
export type SeparatorId = "dot" | "pipe" | "chevron" | "slash" | "dash";
export type MeterStyleId =
  | "bar"
  | "blocks"
  | "shade"
  | "segments"
  | "dots"
  | "squares"
  | "braille"
  | "percent";

export type StatuslineItem = {
  id: string;
  label: string;
  description: string;
  preview: string;
  icon?: string;
};

export type StatuslinePreset = {
  id: string;
  label: string;
  description: string;
  items: string[];
};

export const claudeItems: StatuslineItem[] = [
  {
    id: "folder",
    label: "Folder",
    description: "Current project folder",
    preview: "lpm",
    icon: "📁",
  },
  {
    id: "path",
    label: "Full path",
    description: "Complete working path",
    preview: "~/Projects/lpm",
    icon: "📂",
  },
  {
    id: "model",
    label: "Model",
    description: "Active Claude model",
    preview: "Fable 5",
    icon: "✳",
  },
  {
    id: "branch",
    label: "Git branch",
    description: "Current branch and optional dirty state",
    preview: "main",
    icon: "🌿",
  },
  {
    id: "ctx",
    label: "Context left",
    description: "Context window remaining",
    preview: "ctx 72%",
    icon: "🧠",
  },
  {
    id: "five",
    label: "5-hour usage",
    description: "Current five-hour limit",
    preview: "5h 84%",
    icon: "⚡",
  },
  {
    id: "seven",
    label: "Weekly usage",
    description: "Current weekly limit",
    preview: "7d 63%",
    icon: "📆",
  },
  {
    id: "cost",
    label: "Session cost",
    description: "Estimated cost for this session",
    preview: "$1.42",
    icon: "💰",
  },
  {
    id: "text",
    label: "Custom text",
    description: "Your own label or symbol",
    preview: "ship mode",
  },
];

export const codexItems: StatuslineItem[] = [
  {
    id: "model",
    label: "Model",
    description: "Current model name",
    preview: "gpt-5.6-sol",
  },
  {
    id: "model-with-reasoning",
    label: "Model + reasoning",
    description: "Model with reasoning level",
    preview: "gpt-5.6-sol high",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Current reasoning level",
    preview: "high",
  },
  {
    id: "run-state",
    label: "Run state",
    description: "Ready, Working, or Thinking",
    preview: "Working",
  },
  {
    id: "fast-mode",
    label: "Fast mode",
    description: "Whether Fast mode is active",
    preview: "Fast on",
  },
  {
    id: "raw-output",
    label: "Raw output",
    description: "Raw scrollback mode",
    preview: "raw output",
  },
  {
    id: "task-progress",
    label: "Task progress",
    description: "Latest checklist progress",
    preview: "Tasks 3/4",
  },
  {
    id: "current-dir",
    label: "Current directory",
    description: "Current working directory",
    preview: "~/Projects/lpm",
  },
  {
    id: "project-name",
    label: "Project",
    description: "Detected project name",
    preview: "lpm",
  },
  {
    id: "git-branch",
    label: "Git branch",
    description: "Current branch when available",
    preview: "main",
  },
  {
    id: "pull-request-number",
    label: "Pull request",
    description: "Open pull request number",
    preview: "PR #482",
  },
  {
    id: "branch-changes",
    label: "Branch changes",
    description: "Changes against the default branch",
    preview: "+128 -34",
  },
  {
    id: "context-remaining",
    label: "Context remaining",
    description: "Context window left",
    preview: "Context 72% left",
  },
  {
    id: "context-used",
    label: "Context used",
    description: "Context window consumed",
    preview: "Context 28% used",
  },
  {
    id: "context-window-size",
    label: "Context size",
    description: "Total context window size",
    preview: "1.05M context",
  },
  {
    id: "five-hour-limit",
    label: "Primary limit",
    description: "Primary usage limit remaining",
    preview: "5h 84% left",
  },
  {
    id: "weekly-limit",
    label: "Weekly limit",
    description: "Secondary usage limit remaining",
    preview: "Weekly 63% left",
  },
  {
    id: "used-tokens",
    label: "Tokens used",
    description: "Session token total",
    preview: "18.4K tokens",
  },
  {
    id: "total-input-tokens",
    label: "Input tokens",
    description: "Total input tokens",
    preview: "In 16.8K",
  },
  {
    id: "total-output-tokens",
    label: "Output tokens",
    description: "Total output tokens",
    preview: "Out 1.6K",
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "Permission profile or sandbox",
    preview: "Workspace write",
  },
  {
    id: "approval-mode",
    label: "Approval mode",
    description: "Active command approval mode",
    preview: "On request",
  },
  {
    id: "thread-title",
    label: "Thread title",
    description: "Current session title",
    preview: "Statusline launch",
  },
  {
    id: "thread-id",
    label: "Thread ID",
    description: "Current thread identifier",
    preview: "019f8f…",
  },
  {
    id: "codex-version",
    label: "Codex version",
    description: "Installed Codex version",
    preview: "Codex 0.x",
  },
  {
    id: "workspace-headline",
    label: "Workspace headline",
    description: "Enterprise workspace notice",
    preview: "Review ready",
  },
];

export const claudePresets: StatuslinePreset[] = [
  {
    id: "clean",
    label: "Clean",
    description: "Usage, limits, and cost",
    items: ["folder", "model", "ctx", "five", "seven", "cost"],
  },
  {
    id: "minimalistic",
    label: "Minimalistic",
    description: "A quiet, neutral view",
    items: ["folder", "model", "five", "cost"],
  },
  {
    id: "modern",
    label: "Modern",
    description: "Colorful with icons",
    items: ["folder", "model", "branch", "ctx", "cost"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Build every detail yourself",
    items: ["folder", "model", "ctx"],
  },
  {
    id: "off",
    label: "Off",
    description: "Keep the statusline hidden",
    items: [],
  },
];

export const codexPresets: StatuslinePreset[] = [
  {
    id: "essential",
    label: "Essential",
    description: "Model and working directory",
    items: ["model-with-reasoning", "current-dir"],
  },
  {
    id: "project",
    label: "Project",
    description: "Repository state and context",
    items: [
      "project-name",
      "git-branch",
      "branch-changes",
      "context-remaining",
    ],
  },
  {
    id: "usage",
    label: "Usage",
    description: "Context and account limits",
    items: [
      "model-with-reasoning",
      "context-remaining",
      "five-hour-limit",
      "weekly-limit",
      "fast-mode",
    ],
  },
  {
    id: "detailed",
    label: "Detailed",
    description: "A fuller working-session view",
    items: [
      "model-with-reasoning",
      "current-dir",
      "git-branch",
      "run-state",
      "context-remaining",
      "five-hour-limit",
      "weekly-limit",
      "task-progress",
    ],
  },
  {
    id: "off",
    label: "Off",
    description: "Hide the configurable footer",
    items: [],
  },
];

export const claudeColors: Record<
  ClaudeColorId,
  { label: string; swatch: string; preview: string; ring: string }
> = {
  claude: {
    label: "Claude",
    swatch: "bg-[#D97757]",
    preview: "text-[#F09978]",
    ring: "ring-[#D97757]",
  },
  cyan: {
    label: "Cyan",
    swatch: "bg-cyan-400",
    preview: "text-cyan-300",
    ring: "ring-cyan-400",
  },
  green: {
    label: "Green",
    swatch: "bg-emerald-400",
    preview: "text-emerald-300",
    ring: "ring-emerald-400",
  },
  yellow: {
    label: "Yellow",
    swatch: "bg-amber-400",
    preview: "text-amber-300",
    ring: "ring-amber-400",
  },
  magenta: {
    label: "Magenta",
    swatch: "bg-fuchsia-400",
    preview: "text-fuchsia-300",
    ring: "ring-fuchsia-400",
  },
  blue: {
    label: "Blue",
    swatch: "bg-blue-400",
    preview: "text-blue-300",
    ring: "ring-blue-400",
  },
  default: {
    label: "Default",
    swatch: "bg-zinc-300",
    preview: "text-zinc-300",
    ring: "ring-zinc-400",
  },
  dim: {
    label: "Dim",
    swatch: "bg-zinc-600",
    preview: "text-zinc-500",
    ring: "ring-zinc-500",
  },
};

export const separators: Record<
  SeparatorId,
  { label: string; value: string }
> = {
  dot: { label: "Middle dot", value: "·" },
  pipe: { label: "Pipe", value: "|" },
  chevron: { label: "Chevron", value: "›" },
  slash: { label: "Slash", value: "/" },
  dash: { label: "Dash", value: "—" },
};

export const meterStyles: Record<
  MeterStyleId,
  { label: string; sample: string }
> = {
  bar: { label: "Bars", sample: "━━━━╸━" },
  blocks: { label: "Blocks", sample: "▇▇▃▁" },
  shade: { label: "Shade", sample: "▓▓▒░" },
  segments: { label: "Segments", sample: "▰▰▱▱" },
  dots: { label: "Dots", sample: "●●○○" },
  squares: { label: "Squares", sample: "■■□□" },
  braille: { label: "Braille", sample: "⣿⣿⡆⣀" },
  percent: { label: "Number", sample: "84%" },
};
