import { peerDownCopy, type PeerStatus } from "../peer/peerStatus";
import { PeerRecoveryActions } from "./PeerRecoveryActions";

// Shown in place of a remote project whose peer dropped. The project's row and
// detail return automatically once the peer reconnects and its projects merge
// back in.
export function PeerDisconnectedBanner({
  slug,
  alias,
  status,
  server,
}: {
  // The peer to reconnect to; absent once it is no longer paired here.
  slug?: string;
  alias: string;
  status: PeerStatus | null;
  // A Linux host, listed under Server rather than Another computer.
  server: boolean;
}) {
  const { title, detail, fix } = peerDownCopy(alias, status);
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-active)] text-[var(--text-muted)]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M2 20h20" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <PeerRecoveryActions slug={slug} alias={alias} fix={fix} server={server} />
      </div>
    </div>
  );
}
