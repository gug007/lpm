import { Blocks, PanelBottom, Users } from "lucide-react";
import {
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  SKILLS_PATH,
  STATUSLINE_PATH,
} from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const AGENT_SETUP_AREA: FeatureArea = {
  id: "agent-setup",
  title: "Tune how Claude Code and Codex work in each project",
  description:
    "Pin a Claude account to a project, design the status line, see and write the skills agents load, and keep shared memory and private notes.",
  highlights: [
    {
      icon: Users,
      title: "Multiple Claude Code accounts",
      body: "Add work, personal, or client Claude accounts, sign each in, and pin one per project so its sessions use the right subscription.",
      note: "Automations use your default Claude login.",
      scope: "claude",
      href: CLAUDE_ACCOUNTS_PATH,
      linkLabel: "Multiple accounts",
    },
    {
      icon: PanelBottom,
      title: "Status line designer",
      body: "Build the line under Claude Code from presets or drag-and-drop items like model, branch, context left, and usage meters, and pick Codex's footer fields the same way.",
      scope: "claude-codex",
      href: STATUSLINE_PATH,
      linkLabel: "Status lines",
    },
    {
      icon: Blocks,
      title: "Skills & tools inspector",
      body: "See the MCP servers, skills, plugins, subagents, commands, instruction files, and hooks an agent will load in a folder, with clashes flagged and a context-size estimate.",
      scope: "claude-codex",
      keys: ["⌘⇧K"],
      href: SKILLS_PATH,
      linkLabel: "Skills & tools",
    },
  ],
  features: [
    {
      title: "Write agent skills",
      body: "Create, edit, or delete skills in a form, or describe one and let AI draft it for you to review.",
      href: SKILLS_PATH,
      linkLabel: "Skill authoring",
    },
    {
      title: "Shared session memory",
      body: "Agents save named work sessions with a goal, current state, and timeline, and any agent or a later session can pick one up by name.",
      note: "Needs lpm's agent skills installed.",
      keys: ["⌘⇧M"],
      href: CONNECT_AGENTS_PATH,
      linkLabel: "Install the agent skills",
    },
    {
      title: "Encrypted project notes",
      body: "A private notes space per project, organized as chats with attachments and search, encrypted on disk with the key in your Keychain. Agents don't read them.",
      keys: ["⌘⇧N"],
    },
  ],
};
