import { Laptop } from "lucide-react";
import { TriStateCheckbox } from "../ChangedFilesTree";
import type { SyncPair } from "./ignoredSyncApi";

interface IgnoredSyncMachinesProps {
  pairs: SyncPair[];
  chosen: ReadonlySet<string>;
  // Computers whose folder holds a different repository, by slug.
  otherRepo: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (slug: string, on: boolean) => void;
}

// The other computers that hold the project, each ticked to sync with or not.
export function IgnoredSyncMachines({ pairs, chosen, otherRepo, disabled, onChoose }: IgnoredSyncMachinesProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5 px-3 py-2">
      <div className="text-[11px] text-[var(--text-muted)]">Syncs with</div>
      {pairs.map((p) => {
        const other = otherRepo.has(p.slug);
        const on = chosen.has(p.slug) && !other;
        return (
          <div key={p.slug} className={`flex min-w-0 items-center gap-2.5 ${other ? "opacity-60" : ""}`}>
            <TriStateCheckbox
              state={on ? "all" : "none"}
              disabled={disabled || other}
              onToggle={() => onChoose(p.slug, !on)}
              ariaLabel={`Sync with ${p.machine}`}
            />
            <Laptop size={15} className="shrink-0 text-[var(--accent-cyan-text)]" />
            <span className="shrink-0 text-[13px] font-semibold text-[var(--text-primary)]">{p.machine}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]" />
            <span className="min-w-0 truncate font-mono text-[11px] text-[var(--text-muted)]" title={p.remoteRoot}>
              {other ? "a different repository" : p.remoteRoot}
            </span>
          </div>
        );
      })}
    </div>
  );
}
