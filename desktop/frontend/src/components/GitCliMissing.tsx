import { cliLoginCommand, forgeWords, type GitHost } from "../gitForge";

/** The pull request dialogs' note when the forge's CLI isn't installed. */
export function GitCliMissing({ host }: { host: GitHost | null }) {
  const words = forgeWords(host?.kind);
  return (
    <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-xs text-[var(--accent-red-text)]">
      {words.cliName} not found. Install it from{" "}
      <span className="font-medium">{words.cliUrl}</span> and run{" "}
      <code className="rounded bg-[var(--bg-hover)] px-1">{cliLoginCommand(host)}</code>
    </div>
  );
}
