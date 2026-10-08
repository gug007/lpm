import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Laptop, Plus, Server } from "lucide-react";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { SECONDARY_BUTTON } from "./styles";
import type { PeerClient } from "../../peer/usePeerState";
import { isLinuxHost } from "../../peer/platform";
import { MACHINE } from "../../machineWords";

/** "Pair a device". With other machines connected it asks where: a device
 *  paired with one of them connects to it directly. */
export function PairPhoneButton({
  peers,
  busy,
  onPairHere,
  onPairPeer,
}: {
  peers: PeerClient[];
  busy: boolean;
  onPairHere: () => void;
  onPairPeer: (slug: string, name: string) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const label = busy ? "Preparing…" : "Pair a device";

  if (peers.length === 0) {
    return (
      <button onClick={onPairHere} disabled={busy} className={SECONDARY_BUTTON}>
        <Plus size={12} />
        {label}
      </button>
    );
  }

  const pick = (fn: () => void) => () => {
    setPos(null);
    fn();
  };

  return (
    <>
      <button
        aria-expanded={pos !== null}
        disabled={busy}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (pos) return setPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.right, y: r.bottom + 4 });
        }}
        className={SECONDARY_BUTTON}
      >
        <Plus size={12} />
        {label}
        <ChevronDown size={12} />
      </button>
      {pos &&
        createPortal(
          <ContextMenuShell x={pos.x} y={pos.y} align="end" minWidth={290} onClose={() => setPos(null)}>
            <p className="px-3 pb-1 pt-1.5 text-[11px] text-[var(--text-muted)]">Pair a device with</p>
            <ContextMenuItem
              icon={<Laptop size={14} />}
              label={MACHINE.ThisMachine}
              description="Recommended"
              onClick={pick(onPairHere)}
            />
            {peers.map((p) => {
              const name = p.alias || p.host || "another machine";
              return (
                <ContextMenuItem
                  key={p.slug}
                  icon={isLinuxHost(p) ? <Server size={14} /> : <Laptop size={14} />}
                  label={name}
                  description={
                    p.connected
                      ? `Keeps working while ${MACHINE.thisMachine} is off`
                      : "Not connected. Reconnect it under Connections."
                  }
                  disabled={!p.connected}
                  onClick={pick(() => onPairPeer(p.slug, name))}
                />
              );
            })}
          </ContextMenuShell>,
          document.body,
        )}
    </>
  );
}
