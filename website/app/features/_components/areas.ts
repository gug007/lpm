import {
  Bot,
  CalendarClock,
  FolderGit2,
  GitPullRequest,
  Layers,
  ListChecks,
  MessageSquareText,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

export type AreaMeta = {
  id: string;
  label: string;
  eyebrow: string;
  icon: LucideIcon;
};

export const AREAS: AreaMeta[] = [
  { id: "projects", label: "Projects", eyebrow: "Projects & services", icon: FolderGit2 },
  { id: "agents", label: "Agents", eyebrow: "Terminals & AI agents", icon: Bot },
  { id: "composer", label: "Composer", eyebrow: "Prompt composer", icon: MessageSquareText },
  { id: "parallel", label: "Parallel", eyebrow: "Parallel work", icon: Layers },
  { id: "git", label: "Git & files", eyebrow: "Review, Git & files", icon: GitPullRequest },
  { id: "automations", label: "Automations", eyebrow: "Automations & usage", icon: CalendarClock },
  { id: "agent-setup", label: "Agent setup", eyebrow: "Accounts, skills & memory", icon: SlidersHorizontal },
  { id: "devices", label: "Devices", eyebrow: "Across devices", icon: Network },
  { id: "iphone", label: "iPhone", eyebrow: "lpm link for iPhone", icon: Smartphone },
  { id: "cli", label: "CLI", eyebrow: "CLI & integrations", icon: SquareTerminal },
  { id: "platform", label: "Platform", eyebrow: "Privacy, platform & updates", icon: ShieldCheck },
];

export const REQUIREMENTS_AREA: AreaMeta = {
  id: "requirements",
  label: "Requirements",
  eyebrow: "Requirements",
  icon: ListChecks,
};
