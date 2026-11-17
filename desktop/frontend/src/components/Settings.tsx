import { useEffect, type ReactNode } from "react";
import { usePeerState } from "../peer/usePeerState";
import { useAppStore, type View } from "../store/app";
import { LocalSettings } from "./settings/LocalSettings";
import { PeerSettings } from "./settings/PeerSettings";
import { SettingsMachinePicker } from "./settings/SettingsMachinePicker";

// Settings for this machine, or for a connected one picked at the top of the
// page or from its sidebar menu.
export function Settings({
  onNavigate,
  subpage,
}: {
  onNavigate: (view: View) => void;
  subpage?: ReactNode;
}) {
  const slug = useAppStore((s) => s.settingsMachine);
  const setSettingsMachine = useAppStore((s) => s.setSettingsMachine);
  const { state, loaded } = usePeerState();
  const peer = slug ? state.peers.find((p) => p.slug === slug) : undefined;

  // A machine no longer paired has no settings to show; this one's take over.
  useEffect(() => {
    if (slug && loaded && !peer) setSettingsMachine(null);
  }, [slug, loaded, peer, setSettingsMachine]);

  const picker = (
    <SettingsMachinePicker
      peers={state.peers.filter((p) => p.connected || p.slug === slug)}
      value={slug}
      onChange={setSettingsMachine}
    />
  );

  if (!slug) return <LocalSettings picker={picker} subpage={subpage} onNavigate={onNavigate} />;
  if (!peer) return null;
  return <PeerSettings key={slug} peer={peer} picker={picker} subpage={subpage} onNavigate={onNavigate} />;
}
