// Build the `codex resume <sessionId>` command for a Codex tab once its real
// session id arrives from the SessionStart hook. Leading `KEY=value` env
// assignments and the program token from the original startCmd are preserved so
// a resume relaunches with the same environment/binary; flags and prompt
// arguments in startCmd are dropped (resume replaces them). Falls back to the
// bare `codex` program when startCmd has no program token.
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function buildCodexResumeCmd(
  startCmd: string | undefined,
  sessionId: string,
): string {
  const tokens = (startCmd ?? "").trim().split(/\s+/).filter(Boolean);
  const env: string[] = [];
  let i = 0;
  while (i < tokens.length && ENV_ASSIGNMENT.test(tokens[i])) {
    env.push(tokens[i]);
    i += 1;
  }
  const prog = i < tokens.length ? tokens[i] : "codex";
  return [...env, prog, "resume", sessionId].join(" ");
}
