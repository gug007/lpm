import {
  Eye,
  FileSliders,
  Monitor,
  Save,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export const CLAUDE_STATUSLINE_DOCS = "https://code.claude.com/docs/en/statusline";
export const CODEX_STATUSLINE_DOCS =
  "https://learn.chatgpt.com/docs/config-file/config-reference";

export const CLAUDE_ITEMS = [
  "Keep your own statusline, or switch to Clean, Minimalistic, Modern, or Custom and back",
  "Per-item colors, labels, icons, and custom text",
  "Separators, Git status, and eight usage meter styles",
  "Model, project, context, 5-hour and weekly usage, Git, and session cost",
];

export const CODEX_ITEMS = [
  "Essential, Project, Usage, Detailed, and Off layouts",
  "26 fields in four groups: model, project and Git, context and limits, session",
  "Task progress, permissions, approval mode, thread, and version details",
  "Codex's theme colors on or off, and fields Codex can't fill are left out",
];

export const BENEFITS: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: SlidersHorizontal,
    title: "Visual instead of fragile",
    copy: "Choose from real fields, valid colors, separators, and meter styles. lpm keeps the underlying agent configuration out of your way.",
  },
  {
    icon: Eye,
    title: "Preview the real signal",
    copy: "See representative values in your lpm terminal theme and font size, updating as each change is saved.",
  },
  {
    icon: Save,
    title: "Saved while you work",
    copy: "A preset applies the moment you pick it and custom edits right after you pause, so you can iterate without copying snippets between files.",
  },
];

export const STEPS: {
  step: string;
  icon: LucideIcon;
  title: string;
  copy: string;
}[] = [
  {
    step: "01",
    icon: Settings2,
    title: "Open AI & Integrations",
    copy: "In lpm, open Settings (⌘, or the More menu at the bottom of the sidebar) and select AI & Integrations.",
  },
  {
    step: "02",
    icon: FileSliders,
    title: "Choose the statusline",
    copy: "Click Customize beside Claude Code status line or Codex CLI status line, then pick a starting layout.",
  },
  {
    step: "03",
    icon: Monitor,
    title: "Tune it live",
    copy: "Arrange fields, adjust appearance, and watch the saved statusline update as you work.",
  },
];
