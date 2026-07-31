import type { DiscoveredPeer } from "../../peer/usePeerState";
import { Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";

// A Mac lpm found on this network. Connecting asks it for approval, so the row
// stays put while that's outstanding and shows the number to compare over there.
export function NearbyMacRow({
  mac,
  waiting,
  sas,
  disabled,
  onConnect,
  onCancel,
}: {
  mac: DiscoveredPeer;
  waiting: boolean;
  sas: string;
  disabled: boolean;
  onConnect: () => void;
  onCancel: () => void;
}) {
  return (
    <Row>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
        <LaptopIcon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{mac.name}</p>
        {waiting ? (
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            Waiting for approval on {mac.name}
            {sas ? (
              <>
                {" · "}
                <span className="font-mono tracking-widest text-[var(--text-secondary)]">
                  {sas}
                </span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">Nearby on this network</p>
        )}
      </div>
      {waiting ? (
        <button
          onClick={onCancel}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={disabled}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-cyan) 12%, transparent)",
            color: "var(--accent-cyan)",
          }}
        >
          Connect
        </button>
      )}
    </Row>
  );
}
