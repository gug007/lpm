import type { MemorySession } from "../types";
import { relativeTime } from "../relativeTime";

// The agent named by the newest timeline entry ("### <date> — <agent>"): who
// remembered last, the freshness signal a continuation decision actually needs.
function lastAgentOf(content: string): string {
  const entries = content.match(/^###\s.*—\s*(\S+)\s*$/gm);
  if (!entries || entries.length === 0) return "";
  const last = entries[entries.length - 1];
  return last.slice(last.lastIndexOf("—") + 1).trim();
}

export function MemoryStamp({ session }: { session: MemorySession }) {
  const agent = lastAgentOf(session.content);
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
      {agent && <span className="text-[var(--accent-purple)]">{agent}</span>}
      {agent && " · "}
      {relativeTime(session.updatedAt)}
    </span>
  );
}
