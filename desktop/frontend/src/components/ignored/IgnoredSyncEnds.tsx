import { ArrowLeftRight } from "lucide-react";
import { IgnoredSyncEnd } from "./IgnoredSyncEnd";
import { IgnoredSyncMachines } from "./IgnoredSyncMachines";
import type { SyncPair } from "./ignoredSyncApi";

interface IgnoredSyncEndsProps {
  here: string;
  localRoot: string;
  pairs: SyncPair[];
  chosen: ReadonlySet<string>;
  otherRepo: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (slug: string, on: boolean) => void;
}

// The computers the ticked files stay the same on: this one, and the other
// one — or, when several hold the project, the ones ticked.
export function IgnoredSyncEnds({ here, localRoot, pairs, chosen, otherRepo, disabled, onChoose }: IgnoredSyncEndsProps) {
  return (
    <div className="flex items-center gap-2.5 px-6 pb-4">
      <IgnoredSyncEnd label="Here" name={here} path={localRoot} remote={false} target={false} />
      <span
        aria-label="Kept the same every way"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--accent-cyan-text)]"
      >
        <ArrowLeftRight size={15} />
      </span>
      {pairs.length > 1 ? (
        <IgnoredSyncMachines
          pairs={pairs}
          chosen={chosen}
          otherRepo={otherRepo}
          disabled={disabled}
          onChoose={onChoose}
        />
      ) : (
        <IgnoredSyncEnd label="Syncs with" name={pairs[0].machine} path={pairs[0].remoteRoot} remote target />
      )}
    </div>
  );
}
