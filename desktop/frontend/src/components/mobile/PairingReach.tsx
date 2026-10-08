import { Check, Minus } from "lucide-react";
import { PRIMARY_BUTTON } from "./styles";
import { isTailscaleAddress } from "../../mobile/reachStatus";

/** Where a pairing code works: always on this network, and from anywhere only
 *  when it carries a Tailscale address — otherwise the one fix, before pairing. */
export function PairingReach({
  hosts,
  machine,
  onSetUpTailscale,
}: {
  hosts: string[];
  machine: string;
  onSetUpTailscale?: () => void;
}) {
  const anywhere = hosts.some(isTailscaleAddress);
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">This code works</p>
      <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
        <li className="flex items-center gap-2">
          <Check size={13} className="text-[var(--accent-green)]" /> On this network
        </li>
        <li className="flex items-center gap-2">
          {anywhere ? (
            <Check size={13} className="text-[var(--accent-green)]" />
          ) : (
            <Minus size={13} className="text-[var(--accent-amber-text)]" />
          )}
          {anywhere ? "From anywhere, over Tailscale" : "Not away from home — Tailscale isn't set up"}
        </li>
      </ul>
      {!anywhere && (
        <div className="mt-2.5 flex items-center gap-3 border-t border-[var(--border)] pt-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {onSetUpTailscale
              ? "Set up Tailscale first, then make a new code, so your device reaches it from anywhere."
              : `Set up Tailscale on ${machine} first, so your device reaches it from anywhere.`}
          </p>
          {onSetUpTailscale && (
            <button onClick={onSetUpTailscale} className={PRIMARY_BUTTON}>
              Set up Tailscale
            </button>
          )}
        </div>
      )}
    </div>
  );
}
