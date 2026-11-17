import { configuredHotkeyCombos, HOTKEYS, resolveHotkey, type HotkeyId } from "../../hotkeys";
import { ShortcutRecorder } from "../ui/ShortcutRecorder";
import { useSettingsTarget } from "./settingsTarget";
import { ShortcutResetButton } from "./ShortcutResetButton";

// One of lpm's changeable shortcuts: its keys to record new ones over, and a
// reset once it differs from the default.
export function HotkeyEditor({ id }: { id: HotkeyId }) {
  const { settings, update } = useSettingsTarget();
  const hotkeys = settings.hotkeys;
  const def = HOTKEYS.find((d) => d.id === id);
  if (!def) return null;
  const value = resolveHotkey(hotkeys, id);
  const set = (next: string) => void update({ hotkeys: { ...hotkeys, [id]: next } });

  return (
    <div className="flex items-start gap-2">
      {value !== def.default && <ShortcutResetButton onClick={() => set(def.default)} />}
      <ShortcutRecorder value={value} onChange={set} reserved={configuredHotkeyCombos(hotkeys, id)} />
    </div>
  );
}
