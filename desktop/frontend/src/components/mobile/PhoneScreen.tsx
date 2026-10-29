import { useEffect, useState } from "react";
import { usePeerState } from "../../peer/usePeerState";
import { MobileSettingsPane } from "../MobileSettingsPane";
import { SettingsMachinePicker } from "../settings/SettingsMachinePicker";
import { SettingsTargetContext } from "../settings/settingsTarget";
import { useLocalSettingsTarget } from "../settings/useLocalSettingsTarget";
import { PeerPhonePane } from "./PeerPhonePane";

/** The picker's way onto a phone: Settings → Mobile devices, for this machine
 *  or a connected one picked at the top, so remote control, the ways in, the
 *  paired devices and pairing work the same as there. */
export function PhoneScreen() {
  const local = useLocalSettingsTarget();
  const { state, loaded } = usePeerState();
  const [slug, setSlug] = useState<string | null>(null);
  const peer = slug ? state.peers.find((p) => p.slug === slug) : undefined;

  // A machine no longer paired has no phones to show; this one's take over.
  useEffect(() => {
    if (slug && loaded && !peer) setSlug(null);
  }, [slug, loaded, peer]);

  return (
    <div className="max-h-[min(720px,80vh)] overflow-y-auto px-5 pb-5">
      <SettingsMachinePicker
        peers={state.peers.filter((p) => p.connected || p.slug === slug)}
        value={slug}
        onChange={setSlug}
      />
      {peer ? (
        <PeerPhonePane key={peer.slug} peer={peer} />
      ) : (
        <SettingsTargetContext.Provider value={local}>
          <MobileSettingsPane />
        </SettingsTargetContext.Provider>
      )}
    </div>
  );
}
