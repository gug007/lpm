import type { TerminalInstance } from "./paneTree";
import { commandName } from "./path";

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type AgentSessionProvider = "claude" | "codex";

export interface AgentSessionRef {
  provider: AgentSessionProvider;
  sessionId: string;
}

// Every agent whose past conversations Resume session lists. Claude and Codex
// also report the conversation a live tab runs; the others are only known by
// the command a tab resumed one with.
export type ResumableProvider = AgentSessionProvider | "gemini" | "opencode" | "cursor";

export const RESUMABLE_PROVIDERS: readonly ResumableProvider[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "cursor",
];

export interface ResumableRef {
  provider: ResumableProvider;
  sessionId: string;
}

export function isResumableProvider(value: string): value is ResumableProvider {
  return (RESUMABLE_PROVIDERS as readonly string[]).includes(value);
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
    program: commandName(tokens[programIdx]),
  };
}

export function agentProviderOfCommand(
  command: string | undefined,
): AgentSessionProvider | null {
  const program = parseAgentCommand(command)?.program;
  return program === "claude" || program === "codex" ? program : null;
}

function validRef<P extends ResumableProvider>(provider: P, sessionId: string | undefined) {
  return sessionId && isValidAgentSessionId(sessionId)
    ? { provider, sessionId }
    : null;
}

export function agentSessionRefOf(
  resumeCmd: string | undefined,
): AgentSessionRef | null {
  const parsed = parseAgentCommand(resumeCmd);
  return parsed ? claudeOrCodexRef(parsed) : null;
}

function claudeOrCodexRef({ tokens, programIdx, program }: ParsedAgentCommand): AgentSessionRef | null {
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

// The value a flag carries, as `--flag value` or `--flag=value`.
function flagValue(tokens: string[], from: number, names: string[]): string | undefined {
  for (let i = from; i < tokens.length; i++) {
    if (names.includes(tokens[i])) return tokens[i + 1];
    const eq = tokens[i].indexOf("=");
    if (eq > 0 && names.includes(tokens[i].slice(0, eq))) return tokens[i].slice(eq + 1);
  }
  return undefined;
}

// The conversation a command resumes, for any agent Resume session lists:
// `gemini --resume <id>`, `opencode --session <id>`, `cursor-agent --resume
// <id>`, and Claude's and Codex's own forms. Gemini also takes `latest` or a
// list position, which name no conversation.
export function resumableSessionRefOf(resumeCmd: string | undefined): ResumableRef | null {
  const parsed = parseAgentCommand(resumeCmd);
  if (!parsed) return null;
  const ref = claudeOrCodexRef(parsed);
  if (ref) return ref;
  const { tokens, programIdx, program } = parsed;
  const from = programIdx + 1;
  if (program === "gemini") {
    const id = flagValue(tokens, from, ["--resume", "-r"]);
    return id === "latest" || /^\d+$/.test(id ?? "") ? null : validRef("gemini", id);
  }
  if (program === "opencode") return validRef("opencode", flagValue(tokens, from, ["--session", "-s"]));
  if (program === "cursor-agent" || program === "agent") {
    return validRef("cursor", flagValue(tokens, from, ["--resume"]));
  }
  return null;
}

// The conversation a tab holds, for Resume session's "already open" check.
export function resumableSessionOf(tab: TerminalInstance): ResumableRef | null {
  return agentSessionOf(tab) ?? resumableSessionRefOf(tab.resumeCmd);
}

// The Claude conversation a launch command continues, if any. A terminal
// started for it runs on the account that holds that conversation. A fork is a
// new session, so it follows the project's own account choice instead.
export function claudeResumeSessionId(command: string | undefined): string | undefined {
  if (parseAgentCommand(command)?.tokens.includes("--fork-session")) return undefined;
  const ref = agentSessionRefOf(command);
  return ref?.provider === "claude" ? ref.sessionId : undefined;
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
