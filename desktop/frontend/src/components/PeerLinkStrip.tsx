import { PeerReconnect } from "../../bridge/commands";
import { isPeerName, peerSlugOf } from "../peer/markers";
import { rttText } from "../peer/peerStatus";
import type { PeerClient } from "../peer/usePeerState";

interface PeerLinkStripProps {
  project: string | null;
  peers: PeerClient[];
}

// Above a paired computer's project while its link is up but slow or not
// answering: its terminals lag or stall well before the link is given up on.
export function PeerLinkStrip({ project, peers }: PeerLinkStripProps) {
  const peer = project && isPeerName(project) ? peers.find((p) => p.slug === peerSlugOf(project)) : undefined;
  const link = peer?.connected ? peer.link : null;
  if (!peer || !link || link.health === "ok") return null;
  const alias = peer.alias || peer.host;
  const silent = link.health === "silent";

  return (
    <div
      role="status"
      className="mb-2 flex shrink-0 items-center gap-3 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/[0.06] px-3 py-2 text-[12px]"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-amber)]" />
      <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
        {silent
          ? `${alias} isn't responding. Its terminals catch up once it answers, and lpm reconnects after a minute of silence.`
          : `The link to ${alias} is slow (${rttText(link.rttMs ?? 0)} round trip), so its terminals may lag.`}
      </span>
      {silent && (
        <button
          type="button"
          onClick={() => void PeerReconnect(peer.slug)}
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
        >
          Reconnect now
        </button>
      )}
    </div>
  );
}
