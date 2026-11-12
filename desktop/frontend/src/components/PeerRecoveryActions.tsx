import { PeerReconnect } from "../../bridge/commands";
import type { PeerFix } from "../peer/peerStatus";
import { usePeerRecovery } from "../peer/usePeerRecovery";

const SIZES = {
  md: "rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)] disabled:opacity-50",
  sm: "shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50",
} as const;

/** The buttons that bring a paired machine that isn't answering back: turn it
 *  on here, pair again, or reconnect, with where its connection is set up. */
export function PeerRecoveryActions({
  slug,
  alias,
  fix,
  server,
  size = "md",
}: {
  // Absent once the machine is no longer paired here.
  slug?: string;
  alias: string;
  fix: PeerFix;
  // A Linux host, set up under Server rather than Another computer.
  server: boolean;
  size?: keyof typeof SIZES;
}) {
  const { turnOn, busy, openConnections } = usePeerRecovery(slug, alias, server);
  const button = SIZES[size];

  if (fix === "pairAgain") {
    return (
      <button type="button" onClick={openConnections} className={button}>
        Pair again…
      </button>
    );
  }
  if (!slug) return null;
  if (fix === "reconnect") {
    return (
      <button type="button" onClick={() => void PeerReconnect(slug)} className={button}>
        {size === "md" ? "Reconnect now" : "Reconnect"}
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={turnOn} disabled={busy} className={button}>
        Turn on {alias}
      </button>
      <button type="button" onClick={openConnections} className={button}>
        Connection settings
      </button>
    </>
  );
}
