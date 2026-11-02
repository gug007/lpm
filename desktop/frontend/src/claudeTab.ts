import { agentProviderOfCommand, agentSessionOf } from "./agentSession";
import { isTerminalTab, type TerminalInstance } from "./paneTree";

// Whether a tab runs Claude Code: the conversation its agent reported, or the
// command it was launched with until then. A tab whose agent was quit is a
// plain shell again.
export function isClaudeTab(tab: TerminalInstance): boolean {
  if (!isTerminalTab(tab) || tab.agentEnded) return false;
  const session = agentSessionOf(tab);
  if (session) return session.provider === "claude";
  return agentProviderOfCommand(tab.startCmd ?? tab.resumeCmd) === "claude";
}
