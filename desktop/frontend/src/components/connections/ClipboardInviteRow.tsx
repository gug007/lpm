import type { PeerInvite } from "../../peer/invite";
import { LaptopIcon } from "./LaptopIcon";

// An invite in the clipboard is someone mid-way through connecting: the machine
// is already decided, so the row offers the finish rather than a field to paste
// into.
export function ClipboardInviteRow({
  invite,
  busy,
  onConnect,
  onDismiss,
}: {
  invite: PeerInvite;
  busy: boolean;
  onConnect: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ backgroundColor: "color-mix(in srgb, var(--accent-green) 6%, transparent)" }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent-green) 15%, transparent)",
          color: "var(--accent-green)",
        }}
      >
        <LaptopIcon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          Invite found in your clipboard
        </p>
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          Connect to {invite.hosts[0]}:{invite.port}?
        </p>
      </div>
      <button
        onClick={onConnect}
        disabled={busy}
        className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: "var(--accent-green)" }}
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        Dismiss
      </button>
    </div>
  );
}
