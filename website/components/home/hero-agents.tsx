import { AgentMark, type Agent } from "./agent-mark";

const AGENTS: { agent: Agent; label: string; short: string }[] = [
  { agent: "claude", label: "Claude Code", short: "Claude" },
  { agent: "codex", label: "Codex", short: "Codex" },
  { agent: "gemini", label: "Gemini CLI", short: "Gemini" },
  { agent: "opencode", label: "OpenCode", short: "OpenCode" },
];

// Visitors scan for the agent they already use, and a mark is found before
// any copy is read. The row never wraps: phones get the short names, and the
// label only for screen readers.
export function HeroAgents() {
  return (
    <p className="mb-5 flex items-center justify-center gap-x-2.5 whitespace-nowrap text-[11px] text-gray-500 min-[360px]:text-[12px] sm:gap-x-5 sm:text-[13px] dark:text-gray-400">
      <span className="sr-only sm:not-sr-only">Works with</span>
      {AGENTS.map(({ agent, label, short }) => (
        <span
          key={agent}
          className="inline-flex items-center gap-1 font-medium text-gray-700 sm:gap-1.5 dark:text-gray-200"
        >
          <AgentMark agent={agent} className="h-3.5 w-3.5" />
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>
      ))}
    </p>
  );
}
