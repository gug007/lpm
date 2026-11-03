import { PeerReconnect } from "../../bridge/commands";
import { MACHINE } from "../machineWords";
import { type PeerStatus } from "../peer/peerStatus";

// Shown in place of a remote project whose peer dropped. The project's row and
// detail return automatically once the peer reconnects and its projects merge
// back in — unless it was turned off here or stopped accepting this Mac, which
// no retry fixes, so the copy says what will.
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
  const where = `+ above your projects → ${server ? "Server" : "Another computer"}`;
  const unauthorized = status?.tone === "error" && /unauthorized|auth failed|401/i.test(status.detail);
  const title =
    status?.tone === "off"
      ? `${alias} is turned off on ${MACHINE.thisMachine}`
      : unauthorized
        ? `${alias} no longer accepts ${MACHINE.thisMachine}`
        : `${alias} disconnected`;
  const detail =
    status?.tone === "off"
      ? `Turn it on from ${where}.`
      : unauthorized
        ? `Its access was removed there. Pair again from ${where}.`
        : status?.tone === "error"
          ? `${status.text}. Trying again…`
          : "Reconnecting…";
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
      {slug && status?.tone !== "off" && !unauthorized && (
        <button
          type="button"
          onClick={() => void PeerReconnect(slug)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
        >
          Reconnect now
        </button>
      )}
    </div>
  );
}
