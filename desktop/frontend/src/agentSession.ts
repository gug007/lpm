import type { TerminalInstance } from "./paneTree";

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type AgentSessionProvider = "claude" | "codex";

export interface AgentSessionRef {
  provider: AgentSessionProvider;
  sessionId: string;
}

export interface ParsedAgentCommand {
  tokens: string[];
  programIdx: number;
  program: string;
}

export function isValidAgentSessionId(sessionId: string): boolean {
  return SESSION_ID.test(sessionId);
}

// Leading `FOO=bar` assignments are part of the launch command, so the program
// is the first token that isn't one.
export function parseAgentCommand(
  command: string | undefined,
): ParsedAgentCommand | null {
  const tokens = (command ?? "").trim().split(/\s+/).filter(Boolean);
  const programIdx = tokens.findIndex((token) => !ENV_ASSIGNMENT.test(token));
  if (programIdx === -1) return null;
  return {
    tokens,
    programIdx,
    program: tokens[programIdx].split("/").pop() ?? "",
  };
}

export function agentProviderOfCommand(
  command: string | undefined,
): AgentSessionProvider | null {
  const program = parseAgentCommand(command)?.program;
  return program === "claude" || program === "codex" ? program : null;
}

function validRef(provider: AgentSessionProvider, sessionId: string | undefined) {
  return sessionId && isValidAgentSessionId(sessionId)
    ? { provider, sessionId }
    : null;
}

export function agentSessionRefOf(
  resumeCmd: string | undefined,
): AgentSessionRef | null {
  const parsed = parseAgentCommand(resumeCmd);
  if (!parsed) return null;
  const { tokens, programIdx, program } = parsed;

  if (program === "codex" && tokens[programIdx + 1] === "resume") {
    return validRef("codex", tokens[programIdx + 2]);
  }
  if (program !== "claude") return null;

  const resumeFlagIdx = tokens.indexOf("--resume", programIdx + 1);
  if (resumeFlagIdx !== -1) {
    return validRef("claude", tokens[resumeFlagIdx + 1]);
  }
  if (tokens[programIdx + 1] === "resume") {
    return validRef("claude", tokens[programIdx + 2]);
  }
  return null;
}

// Which agent conversation a tab belongs to: the live id its SessionStart hook
// reported, falling back to the resume command until that first event lands.
export function agentSessionOf(tab: TerminalInstance): AgentSessionRef | null {
  return tab.agentSession ?? agentSessionRefOf(tab.resumeCmd);
}

export function buildClaudeResumeCmd(
  currentCmd: string | undefined,
  sessionId: string,
): string {
  const parsed = parseAgentCommand(currentCmd);
  if (!parsed || parsed.program !== "claude") {
    return `claude --resume ${sessionId}`;
  }
  const { tokens, programIdx } = parsed;

  const resumeFlagIdx = tokens.indexOf("--resume", programIdx + 1);
  if (resumeFlagIdx !== -1 && resumeFlagIdx + 1 < tokens.length) {
    const updated = [...tokens];
    updated[resumeFlagIdx + 1] = sessionId;
    return updated.join(" ");
  }
  if (tokens[programIdx + 1] === "resume" && programIdx + 2 < tokens.length) {
    const updated = [...tokens];
    updated[programIdx + 2] = sessionId;
    return updated.join(" ");
  }

  return [...tokens.slice(0, programIdx + 1), "--resume", sessionId].join(" ");
}
