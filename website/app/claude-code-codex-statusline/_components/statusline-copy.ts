import { Eye, Save, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

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

export const STATUSLINE_LESSONS: {
  agent: "claude" | "codex";
  lesson: YouTubeLessonId;
  title: string;
  length: string;
  steps: string[];
  tone: { border: string; chip: string };
}[] = [
  {
    agent: "claude",
    lesson: "claude-statusline",
    title: "Claude Code",
    length: "1:43",
    steps: [
      "Open Settings, choose AI & Integrations, and click Customize beside Claude Code status line.",
      "Pick Clean: folder, model, context left, 5-hour and weekly limits, and cost. Remove whatever you don't need.",
      "Go back to the project. The Claude session already running shows the new line, no restart needed.",
    ],
    tone: {
      border: "border-[#D97757]/25",
      chip: "bg-[#D97757]/12 text-[#B75F40] dark:text-[#F09978]",
    },
  },
  {
    agent: "codex",
    lesson: "codex-statusline",
    title: "Codex",
    length: "1:28",
    steps: [
      "Open Settings, choose AI & Integrations, and click Customize beside Codex CLI status line.",
      "Pick Usage: model, context left, and 5-hour and weekly limits. Remove Fast mode if you don't use it.",
      "Open Codex again. The new session shows the line right under the prompt.",
    ],
    tone: {
      border: "border-[#10A37F]/25",
      chip: "bg-[#10A37F]/12 text-[#087A5E] dark:text-[#4FD1AB]",
    },
  },
];
