// Build the launch command that forks a live agent session into a new
// terminal, continuing the conversation without touching the original.
// Claude: `--fork-session` branches the transcript into a new session whose id
// we pre-mint via `--session-id`, so the forked tab gets a working resumeCmd
// immediately. Codex: `codex fork <id>` copies the rollout into a new session
// (`codex resume` would double-write the live rollout); the fork's real id
// arrives later through the SessionStart hook -> `codex-session` event, the
// same after-the-fact upgrade a normal Codex launch uses.
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export interface ForkLaunch {
  cmd: string;
  resumeCmd?: string;
}

function parse(resumeCmd: string | undefined) {
  const tokens = (resumeCmd ?? "").trim().split(/\s+/).filter(Boolean);
  const progIdx = tokens.findIndex((t) => !ENV_ASSIGNMENT.test(t));
  if (progIdx === -1) return null;
  const prog = tokens[progIdx].split("/").pop() ?? "";
  return { tokens, progIdx, prog };
}

export function canForkSession(resumeCmd: string | undefined): boolean {
  const parsed = parse(resumeCmd);
  if (!parsed) return false;
  const { tokens, progIdx, prog } = parsed;
  if (prog === "claude") {
    const resumeIdx = tokens.indexOf("--resume");
    return resumeIdx > progIdx && resumeIdx + 1 < tokens.length;
  }
  return (
    prog === "codex" &&
    tokens[progIdx + 1] === "resume" &&
    progIdx + 2 < tokens.length
  );
}

// The session id a Claude tab would resume — the transcript that must be
// copied into a duplicate before the fork can run there. Null for Codex
// (rollouts are stored globally, not per-directory) and unforkable commands.
export function claudeSessionIdOf(resumeCmd: string | undefined): string | null {
  if (!canForkSession(resumeCmd)) return null;
  const { tokens, prog } = parse(resumeCmd)!;
  if (prog !== "claude") return null;
  return tokens[tokens.indexOf("--resume") + 1];
}

export function buildForkLaunch(resumeCmd: string): ForkLaunch | null {
  if (!canForkSession(resumeCmd)) return null;
  const { tokens, progIdx, prog } = parse(resumeCmd)!;
  if (prog === "claude") {
    const newId = crypto.randomUUID();
    const forkedResume = [...tokens];
    forkedResume[tokens.indexOf("--resume") + 1] = newId;
    return {
      cmd: [...tokens, "--fork-session", "--session-id", newId].join(" "),
      resumeCmd: forkedResume.join(" "),
    };
  }
  const forked = [...tokens];
  forked[progIdx + 1] = "fork";
  return { cmd: forked.join(" ") };
}
