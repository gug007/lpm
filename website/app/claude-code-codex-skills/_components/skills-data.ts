import {
  AlertTriangle,
  Blocks,
  Gauge,
  Layers,
  ListTree,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

export const CODEX_SKILLS_DOCS = "https://learn.chatgpt.com/docs/build-skills";
export const CLAUDE_SKILLS_DOCS = "https://code.claude.com/docs/en/skills";

export const CLAUDE_ITEMS = [
  "Personal skills in ~/.claude/skills, project skills in the repo's .claude/skills",
  "Auto-run when the description matches, or manual-only on request",
  "Manual-only skills stay out of context entirely: zero tokens up front",
  "Per-skill estimates of what each description costs every turn",
];

export const CODEX_ITEMS = [
  "The shared ~/.agents/skills folder, plus Codex's own ~/.codex/skills",
  "Invoked with $name, and lpm shows the right token for each folder",
  "Manual-only honored by Codex; in the shared folder, Gemini CLI and OpenCode still load it",
  "Descriptions checked against what both CLIs accept",
];

export const BENEFITS: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: Sparkles,
    title: "Describe it, AI drafts it",
    copy: "Type one sentence about the task. lpm reads your repository and drafts the name, description, and instructions to match how your project works, on the AI CLI and model you pick. Nothing is saved until you click Create.",
  },
  {
    icon: PencilLine,
    title: "Edit without breaking files",
    copy: "Reopen any skill in your personal or project folders, including ones you wrote by hand, and change its description, instructions, or who runs it. lpm rewrites only the fields you touched.",
  },
  {
    icon: Gauge,
    title: "See what skills cost",
    copy: "Descriptions load before every turn; instructions only when a skill runs. lpm estimates what each description costs every turn and shows each skill's size on disk, so you know which deserve a manual-only switch.",
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
    icon: Layers,
    title: "Open Skills & tools",
    copy: "Press ⌘⇧K in any project, or choose Skills & tools from the ⋯ menu in the terminal pane header. You can pin it to the toolbar from there.",
  },
  {
    step: "02",
    icon: Plus,
    title: "Create a new skill",
    copy: "Click New skill, describe the task, and let AI draft the fields, or fill in the name, description, and instructions yourself.",
  },
  {
    step: "03",
    icon: PencilLine,
    title: "Refine as you go",
    copy: "Pick who runs it and press Create. Reopen the skill any time to edit it, and a deleted skill goes to the Trash, so you can get it back.",
  },
];

export const PANE_ITEMS: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: ListTree,
    title: "Everything each CLI loads",
    copy: "Skills sit next to subagents, slash commands, MCP servers, plugins, hooks, and CLAUDE.md or AGENTS.md files, for Claude Code and Codex, filterable by CLI, kind, or text.",
  },
  {
    icon: Gauge,
    title: "A context budget bar",
    copy: "A running estimate of what the agent loads every turn, from instruction files and skill and subagent descriptions. MCP tool schemas are flagged as not counted.",
  },
  {
    icon: AlertTriangle,
    title: "Conflicts, called out",
    copy: "lpm warns when a name is already taken in that folder, or when your personal copy of a skill will win over the project's copy.",
  },
  {
    icon: Blocks,
    title: "Plugin skills, read-only",
    copy: "Skills that ship inside a Claude Code plugin are listed and readable but not editable, and on SSH projects the whole pane is a read-only view.",
  },
  {
    icon: Trash2,
    title: "Deletes you can undo",
    copy: "Before a skill is removed, a preview shows exactly what goes to the macOS Trash.",
  },
  {
    icon: Sparkles,
    title: "lpm's own skills",
    copy: "One click in Settings installs skills that teach Claude Code, Codex, Gemini CLI, and OpenCode to start, stop, and duplicate your lpm projects.",
  },
];
