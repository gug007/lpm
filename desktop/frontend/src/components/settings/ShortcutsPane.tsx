import { builtinShortcutGroups } from "../../builtinShortcuts";
import { HOTKEYS, type HotkeyId } from "../../hotkeys";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { QuickTerminalSection } from "./QuickTerminalSection";
import { useSettingsTarget } from "./settingsTarget";
import { FixedShortcut } from "./FixedShortcut";
import { HotkeyEditor } from "./HotkeyEditor";

// The section each changeable shortcut sits in, at its top.
const HOTKEY_GROUP: Record<HotkeyId, string> = {
  tabSwitchNext: "tabs",
  tabSwitchPrev: "tabs",
  paneFocusNext: "tabs",
  paneFocusPrev: "tabs",
  renameProject: "projects",
  deleteProject: "projects",
  dictate: "input",
};

export function ShortcutsPane() {
  const { settings } = useSettingsTarget();
  const groups = builtinShortcutGroups(Boolean(settings.experimentalTTS));

  return (
    <>
      <QuickTerminalSection />
      {groups.map((group) => (
        <SettingsSection key={group.id} title={group.title}>
          {HOTKEYS.filter((def) => HOTKEY_GROUP[def.id] === group.id).map((def) => (
            <SettingsRow key={def.id} id={`shortcut.${def.id}`} label={def.label} description={def.description}>
              <HotkeyEditor id={def.id} />
            </SettingsRow>
          ))}
          {group.shortcuts.map((s) => (
            <SettingsRow key={s.id} id={`shortcut.builtin.${s.id}`} label={s.label} description={s.description}>
              <FixedShortcut keys={s.keys} />
            </SettingsRow>
          ))}
        </SettingsSection>
      ))}
    </>
  );
}
