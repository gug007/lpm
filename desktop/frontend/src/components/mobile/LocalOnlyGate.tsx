import { Wifi } from "lucide-react";
import { PRIMARY_BUTTON, QUIET_BUTTON, SECONDARY_BUTTON } from "./styles";

/** Shown in place of a pairing code that can't work away from home: what that
 *  means, the fix, and pairing for this network only as a choice made knowingly. */
export function LocalOnlyGate({
  machine,
  isThisMachine,
  onSetUpTailscale,
  onAccept,
  onCancel,
}: {
  machine: string;
  isThisMachine: boolean;
  onSetUpTailscale?: () => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex gap-3 rounded-lg border border-[var(--border)] px-3.5 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-amber) 16%, transparent)",
            color: "var(--accent-amber-text)",
          }}
        >
          <Wifi size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">This code won't work away from home</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {isThisMachine ? "Tailscale isn't set up" : `Tailscale isn't set up on ${machine}`}, so your device can
            reach {isThisMachine ? machine : "it"} only while it's on the same network. It won't connect from cellular
            or another Wi-Fi.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button onClick={onCancel} className={QUIET_BUTTON}>
          Cancel
        </button>
        <button onClick={onAccept} className={onSetUpTailscale ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
          Pair for this network only
        </button>
        {onSetUpTailscale && (
          <button onClick={onSetUpTailscale} className={PRIMARY_BUTTON}>
            Set up Tailscale
          </button>
        )}
      </div>
    </div>
  );
}
