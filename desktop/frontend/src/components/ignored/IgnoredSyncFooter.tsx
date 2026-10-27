import type { Prefer } from "./ignoredSyncApi";
import type { Peer, Totals } from "./ignoredTree";
import { countOf, listNames } from "./syncWords";

interface IgnoredSyncFooterProps {
  here: string;
  // The computers ticked to sync with.
  peers: Peer[];
  totals: Totals;
  paths: number;
  // The computers that already sync, and whether any of them is paused.
  syncing: string[];
  paused: boolean;
  // What is ticked is exactly what already syncs, with the same computers.
  unchanged: boolean;
  prefer: Prefer;
  onPrefer: (prefer: Prefer) => void;
  onStop: () => void;
  onCancel: () => void;
  onSync: () => void;
}

const SEGMENT = "rounded-md px-2.5 py-1 text-[12px] transition-colors";

export function IgnoredSyncFooter({
  here,
  peers,
  totals,
  paths,
  syncing,
  paused,
  unchanged,
  prefer,
  onPrefer,
  onStop,
  onCancel,
  onSync,
}: IgnoredSyncFooterProps) {
  const stopping = paths === 0 && syncing.length > 0;
  const withWhom = peers.length > 2 ? `${peers.length} computers` : listNames(peers.map((p) => p.name));
  const label = stopping
    ? "Stop syncing"
    : peers.length === 0
      ? "Pick a computer"
      : paths === 0
        ? "Nothing ticked"
        : unchanged
          ? "Sync now"
          : `Sync ${countOf(totals.files, "file")} with ${withWhom}`;
  const sub =
    paths === 0
      ? "Tick a folder or a file"
      : totals.differ
        ? `${countOf(totals.differ, "ticked item")} ${totals.differ === 1 ? "differs" : "differ"} now`
        : `Same on ${peers.length > 1 ? "all" : "both"} now`;
  const choices: [Prefer, string][] = [
    ["newest", "Newest"],
    ["here", `${here}'s`],
    ...peers.map((p): [Prefer, string] => [p.slug, `${p.name}'s`]),
  ];
  return (
    <div className="mt-2.5 flex items-center gap-4 border-t border-[var(--border)] px-6 pb-5 pt-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {totals.differ > 0 && paths > 0 && peers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-[var(--text-secondary)]">Where they differ, keep</span>
            <div role="radiogroup" aria-label="Where they differ, keep" className="flex rounded-lg border border-[var(--border)] p-0.5">
              {choices.map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={prefer === value}
                  onClick={() => onPrefer(value)}
                  className={`${SEGMENT} ${
                    prefer === value
                      ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span className="text-[12px] leading-snug text-[var(--text-muted)]">
            Ticked files stay the same on {peers.length > 1 ? "every computer" : "both computers"} while they're
            connected.
          </span>
        )}
        {syncing.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <span>{paused ? "Syncing is paused after an undo." : `Already syncing with ${listNames(syncing)}.`}</span>
            <button
              type="button"
              onClick={onStop}
              className="rounded px-1 text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              Stop syncing
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={stopping ? onStop : onSync}
            disabled={!stopping && (paths === 0 || peers.length === 0)}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-40"
          >
            {label}
          </button>
        </div>
        <span className="text-[11.5px] text-[var(--text-muted)]">{sub}</span>
      </div>
    </div>
  );
}
