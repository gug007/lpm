import { PeerReconnect } from "../../../../bridge/commands";
import { ClockIcon } from "../../icons";
import { peerDownCopy, peerStatus } from "../../../peer/peerStatus";
import { isLinuxHost } from "../../../peer/platform";
import type { PeerClient } from "../../../peer/usePeerState";
import { relativeAgo } from "../../../relativeTime";
import { formatSchedule } from "../../../jobsFormat";
import type { ScheduledJob } from "../../../hooks/useJobs";

interface JobOfflineGroupProps {
  slug: string;
  alias: string;
  peer: PeerClient | undefined;
  jobs: ScheduledJob[];
  scopeLabelFor: (job: ScheduledJob) => string;
  zoom: number;
}

// A computer's automations while it isn't answering: what it listed last,
// greyed, under what's going on with it, so they don't read as deleted. Nothing
// here can run or change until it's back.
export function JobOfflineGroup({ slug, alias, peer, jobs, scopeLabelFor, zoom }: JobOfflineGroupProps) {
  const down = peerDownCopy(alias, peer ? peerStatus(peer) : null, !!peer && isLinuxHost(peer));
  const why = `${down.title} · ${down.detail}`;

  return (
    <section
      role="status"
      aria-label={why}
      className="mt-3 rounded-[14px] border border-dashed border-[var(--border)] px-3 py-2"
      style={{ zoom }}
    >
      <div className="flex items-center gap-2 py-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-amber)]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--accent-amber-text)]">
          {why}
        </span>
        {down.reconnect && (
          <button
            type="button"
            onClick={() => void PeerReconnect(slug)}
            className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Reconnect
          </button>
        )}
      </div>
      <ul>
        {jobs.map((job) => {
          const meta = [
            scopeLabelFor(job),
            job.valid && job.schedule ? formatSchedule(job.schedule) : "",
            job.lastRunAt ? `ran ${relativeAgo(job.lastRunAt)}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={`${job.project ?? ""}/${job.id}`}
              className="flex items-center gap-3 border-t border-[var(--border)] py-2 opacity-50 first:border-t-0"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-hover)] text-[16px] text-[var(--text-muted)] grayscale">
                {job.emoji || <ClockIcon size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                  {job.label || job.id}
                </span>
                {meta && <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{meta}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
