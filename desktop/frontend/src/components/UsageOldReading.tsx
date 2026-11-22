import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ProviderLimits } from "../hooks/useAgentLimits";
import { lastReadText } from "./stats/limitsFormat";

export interface UsageReader {
  busy: boolean;
  error?: string;
  onRead: () => void;
}

interface UsageOldReadingProps {
  data: ProviderLimits;
  now: number;
  reader?: UsageReader;
}

/** In place of the meters when a reading is old: how old, what it said then,
 *  and a way to read the account again. */
export function UsageOldReading({ data, now, reader }: UsageOldReadingProps) {
  const then = [
    data.weekly && `Weekly was ${Math.round(data.weekly.usedPercent)}%`,
    !data.noFiveHour && data.fiveHour && `5-hour was ${Math.round(data.fiveHour.usedPercent)}%`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5 pt-4">
      <p className="text-base font-medium text-[var(--text-secondary)]">{lastReadText(data.updatedAt, now)}</p>
      {then.length > 0 && <p className="text-xs text-[var(--text-muted)]">{then.join(" · ")} then.</p>}
      {reader && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={reader.onRead}
            disabled={reader.busy}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-2.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-60"
          >
            {reader.busy ? <LoaderCircle size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {reader.busy ? "Reading…" : "Read it now"}
          </button>
          <span className="text-[11px] text-[var(--text-muted)]">
            Claude reports usage only when it replies; this asks it for one short reply.
          </span>
        </div>
      )}
      {reader?.error && <p className="text-xs text-[var(--accent-red-text)]">{reader.error}</p>}
    </div>
  );
}
