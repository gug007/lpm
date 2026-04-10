import { main } from "../../wailsjs/go/models";

export function branchKey(b: main.Branch): string {
  return b.remote ? `${b.remote}/${b.name}` : b.name;
}

export function RemoteBadge({ remote }: { remote: string }) {
  return (
    <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
      {remote}
    </span>
  );
}
