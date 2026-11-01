import { builtinShortcutGroups } from "../../builtinShortcuts";
import { configuredHotkeyCombos, HOTKEYS, resolveHotkey } from "../../hotkeys";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_SECONDARY } from "../ui/buttons";
import { ShortcutRecorder } from "../ui/ShortcutRecorder";
import { QuickTerminalSection } from "./QuickTerminalSection";
import { useSettingsTarget } from "./settingsTarget";

export function ShortcutsPane() {
  const { settings, update } = useSettingsTarget();
  const hotkeys = settings.hotkeys;

  return (
    <>
      <QuickTerminalSection />
      <SettingsSection title="You can change these">
        {HOTKEYS.map((def) => {
          const value = resolveHotkey(hotkeys, def.id);
          const isDefault = value === def.default;
          return (
            <SettingsRow
              key={def.id}
              id={`shortcut.${def.id}`}
              label={def.label}
              description={def.description}
            >
              <div className="flex items-start gap-2">
                {!isDefault && (
                  <button
                    onClick={() => void update({ hotkeys: { ...hotkeys, [def.id]: def.default } })}
                    className={BTN_SECONDARY}
                  >
                    Reset
                  </button>
                )}
                <ShortcutRecorder
                  value={value}
                  onChange={(next) => void update({ hotkeys: { ...hotkeys, [def.id]: next } })}
                  reserved={configuredHotkeyCombos(hotkeys, def.id)}
                />
              </div>
            </SettingsRow>
          );
        })}
      </SettingsSection>
      {builtinShortcutGroups(Boolean(settings.experimentalTTS)).map((group) => (
        <SettingsSection key={group.id} title={group.title}>
          {group.shortcuts.map((s) => (
            <SettingsRow key={s.id} id={`shortcut.builtin.${s.id}`} label={s.label} description={s.description}>
              <span className="inline-block min-w-[7rem] whitespace-nowrap rounded-md border border-[var(--border)] px-3 py-1.5 text-center text-[13px] font-medium text-[var(--text-secondary)]">
                {s.keys}
              </span>
            </SettingsRow>
          ))}
        </SettingsSection>
      ))}
    </>
  );
}
