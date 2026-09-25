import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { CHECKED } from "./limits-data";

const SOURCES = [
  {
    href: "https://code.claude.com/docs/en/commands",
    label: "Claude Code commands",
  },
  {
    href: "https://code.claude.com/docs/en/costs",
    label: "Claude Code costs and /usage",
  },
  {
    href: "https://code.claude.com/docs/en/statusline",
    label: "Claude Code statusline",
  },
  {
    href: "https://code.claude.com/docs/en/changelog",
    label: "Claude Code changelog",
  },
  {
    href: "https://code.claude.com/docs/en/settings-reference",
    label: "Claude Code settings",
  },
  {
    href: "https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work",
    label: "Anthropic usage limits",
  },
  {
    href: "https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan",
    label: "Claude Code with Pro or Max",
  },
  {
    href: "https://support.claude.com/en/articles/11049741-what-is-the-max-plan",
    label: "Claude Max plan limits",
  },
  {
    href: "https://support.claude.com/en/articles/8325606-what-is-the-pro-plan",
    label: "Claude Pro plan limits",
  },
  {
    href: "https://learn.chatgpt.com/docs/developer-commands?surface=cli",
    label: "Codex CLI commands",
  },
  {
    href: "https://learn.chatgpt.com/docs/pricing",
    label: "Codex pricing and limits",
  },
  {
    href: "https://github.com/ccusage/ccusage",
    label: "ccusage",
  },
  {
    href: "https://github.com/steipete/CodexBar",
    label: "CodexBar",
  },
  {
    href: "https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor",
    label: "Claude-Code-Usage-Monitor",
  },
];

export default function FactsChecked() {
  return (
    <ComparisonBasis
      reviewed={CHECKED.label}
      reviewedIso={CHECKED.iso}
      sources={SOURCES}
      lpmNote="Every lpm row and demo on this page was checked against the app's source code."
    />
  );
}
