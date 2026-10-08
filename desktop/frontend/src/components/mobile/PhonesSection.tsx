import { useEffect, useState } from "react";
import { PairPhoneButton } from "./PairPhoneButton";
import { PhoneRow } from "./PhoneRow";
import { NoPhoneCard } from "./NoPhoneCard";
import { LINK_BUTTON } from "./styles";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { APP_STORE_URL } from "../../mobile/links";
import { sortPhones, type PhoneDevice } from "../../mobile/phoneStatus";
import type { PeerClient } from "../../peer/usePeerState";

const TICK = 60_000;

/** The paired devices, newest news first, and the one way to pair another. */
export function PhonesSection({
  devices,
  peers,
  awayReady,
  pairing,
  settingUpAway,
  onSetUpAway,
  onPairHere,
  onPairPeer,
  onRename,
  onRevoke,
}: {
  devices: PhoneDevice[];
  peers: PeerClient[];
  awayReady: boolean;
  pairing: boolean;
  settingUpAway: boolean;
  onSetUpAway: () => void;
  onPairHere: () => void;
  onPairPeer: (slug: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setNow(Date.now()), [devices]);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Your devices</h2>
        {(devices.length > 0 || peers.length > 0) && (
          <PairPhoneButton peers={peers} busy={pairing} onPairHere={onPairHere} onPairPeer={onPairPeer} />
        )}
      </div>
      {devices.length === 0 ? (
        <NoPhoneCard
          awayReady={awayReady}
          busy={pairing}
          settingUpAway={settingUpAway}
          onPair={onPairHere}
          onSetUpAway={onSetUpAway}
        />
      ) : (
        <>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {sortPhones(devices).map((d) => (
              <PhoneRow key={d.id} device={d} now={now} onRename={onRename} onRevoke={onRevoke} />
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-[var(--text-muted)]">
            lpm Link for iPhone and iPad ·{" "}
            <button onClick={() => BrowserOpenURL(APP_STORE_URL)} className={LINK_BUTTON}>
              App Store
            </button>
          </p>
        </>
      )}
    </>
  );
}
