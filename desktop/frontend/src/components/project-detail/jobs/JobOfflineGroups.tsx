import type { ScheduledJob } from "../../../hooks/useJobs";
import { peerAlias, type PeerClient } from "../../../peer/usePeerState";
import { JobOfflineGroup } from "./JobOfflineGroup";

// Each computer that isn't answering, with what it listed last.
export function JobOfflineGroups({
  rows,
  peers,
  scopeLabelFor,
  zoom,
}: {
  rows: ScheduledJob[];
  peers: PeerClient[];
  scopeLabelFor: (job: ScheduledJob) => string;
  zoom: number;
}) {
  const byHost = new Map<string, ScheduledJob[]>();
  for (const row of rows) {
    if (row.offline && row.host) byHost.set(row.host, [...(byHost.get(row.host) ?? []), row]);
  }
  return [...byHost].map(([slug, jobs]) => (
    <JobOfflineGroup
      key={slug}
      slug={slug}
      alias={peerAlias(peers, slug)}
      peer={peers.find((p) => p.slug === slug)}
      jobs={jobs}
      scopeLabelFor={scopeLabelFor}
      zoom={zoom}
    />
  ));
}
