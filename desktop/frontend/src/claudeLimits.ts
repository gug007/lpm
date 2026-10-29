import { ApplyClaudeLimits, PeerSettingsSet } from "../bridge/commands";
import { useSettingsStore, type Settings } from "./store/settings";

type SaveSettings = (patch: Partial<Settings>) => Promise<void>;

const saveHere: SaveSettings = (patch) => useSettingsStore.getState().update(patch);

// The one writer of claudeLimitsEnabled: Claude usage readings, which switching
// accounts needs. Like peersettings.rs, it installs or removes the status-line
// forwarder before saving, so a failed install never leaves the setting on with
// nothing behind it. A connected machine (`host`) does both itself when the
// setting reaches it; `save` is how it gets there, or here, when the caller
// keeps its own copy of the settings.
export async function setClaudeLimitsEnabled(
  enabled: boolean,
  host: string | null = null,
  save?: SaveSettings,
): Promise<void> {
  const patch = { claudeLimitsEnabled: enabled };
  if (host) {
    await (save ? save(patch) : PeerSettingsSet(host, patch));
    return;
  }
  await ApplyClaudeLimits(enabled);
  await (save ?? saveHere)(patch);
}
