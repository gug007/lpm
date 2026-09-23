import type { ClaudeColorId, MeterStyleId, SeparatorId } from "./statusline-data";

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
  red: {
    label: "Red",
    swatch: "bg-red-400",
    preview: "text-red-300",
    ring: "ring-red-400",
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
