import type { MeterStyle, SegColor, SegmentId } from "./statusLineTypes";
import { ansiColors } from "./terminal-colors";

export const STATUS_LINE_SEGMENT_IDS: SegmentId[] = [
  "folder",
  "path",
  "model",
  "branch",
  "ctx",
  "five",
  "seven",
  "cost",
];

export const STATUS_LINE_SEGMENT_LABELS: Record<SegmentId, string> = {
  folder: "Folder",
  path: "Full path",
  model: "Model",
  branch: "Git branch",
  ctx: "Context left",
  five: "5-hour usage",
  seven: "Weekly usage",
  cost: "Session cost",
  text: "Custom text",
};

export const STATUS_LINE_SEGMENT_DESCRIPTIONS: Record<SegmentId, string> = {
  folder: "Current project folder",
  path: "Complete working path",
  model: "Active Claude model",
  branch: "Current Git branch",
  ctx: "Context window remaining",
  five: "Current 5-hour limit",
  seven: "Current weekly limit",
  cost: "Cost for this session",
  text: "Your own label or symbol",
};

export const STATUS_LINE_SEGMENT_ICONS: Record<SegmentId, string> = {
  folder: "📁",
  path: "📂",
  model: "✳",
  branch: "🌿",
  ctx: "🧠",
  five: "⚡",
  seven: "📆",
  cost: "💰",
  text: "",
};

export const STATUS_LINE_SEPARATORS = ["·", "|", "›", "/", "—"];

export const STATUS_LINE_COLORS: {
  id: SegColor;
  swatch: string;
  label: string;
}[] = [
  { id: "default", swatch: "var(--text-secondary)", label: "Default" },
  { id: "dim", swatch: "var(--text-muted)", label: "Dim" },
  { id: "red", swatch: "#cc4b4b", label: "Red" },
  { id: "green", swatch: "#4e9a06", label: "Green" },
  { id: "yellow", swatch: "#c4a000", label: "Yellow" },
  { id: "blue", swatch: ansiColors.brightBlue, label: "Blue" },
  { id: "magenta", swatch: "#a349a4", label: "Magenta" },
  { id: "cyan", swatch: "#06989a", label: "Cyan" },
  { id: "claude", swatch: "#d97757", label: "Claude" },
];

export const STATUS_LINE_METER_STYLES: {
  id: MeterStyle;
  label: string;
  sample: string;
}[] = [
  { id: "bar", label: "Bars", sample: "━━╸━" },
  { id: "blocks", label: "Blocks", sample: "▇▇▃▁" },
  { id: "shade", label: "Shade", sample: "▓▓▒░" },
  { id: "segments", label: "Segments", sample: "▰▰▱▱" },
  { id: "dots", label: "Dots", sample: "●●○○" },
  { id: "squares", label: "Squares", sample: "■■□□" },
  { id: "braille", label: "Braille", sample: "⣿⣿⡆⣀" },
  { id: "percent", label: "Number", sample: "47%" },
];

export function statusLineColorValue(color: SegColor): string {
  return (
    STATUS_LINE_COLORS.find((option) => option.id === color)?.swatch ??
    "var(--text-secondary)"
  );
}
