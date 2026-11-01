import { useEffect, useState } from "react";
import { QuickTerminalStatus as GetQuickTerminalStatus, SetQuickTerminal } from "../../../bridge/commands";
import {
  captureGlobalKey,
  defaultQuickTerminalKey,
  globalKeyLabel,
  quickTerminalProblemText,
  type QuickTerminalStatus,
} from "../../quickTerminalKeys";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_SECONDARY } from "../ui/buttons";
import { ShortcutRecorder } from "../ui/ShortcutRecorder";
import { Toggle } from "../ui/Toggle";
import { useSettingsTarget } from "./settingsTarget";

const IDLE: QuickTerminalStatus = { registered: false, problem: null };

// Settings › Shortcuts › From any app: the quick terminal's switch and key. The
// key is only saved as on once this computer has actually registered it.
export function QuickTerminalSection() {
  const { machine, settings, update } = useSettingsTarget();
  const [status, setStatus] = useState<QuickTerminalStatus>(IDLE);
  const [busy, setBusy] = useState(false);
  const local = machine.kind === "local";
  const fallback = defaultQuickTerminalKey();
  const key = settings.quickTerminal?.key ?? fallback;
  const enabled = Boolean(settings.quickTerminal?.enabled) && status.registered;

  useEffect(() => {
    if (!local) return;
    void GetQuickTerminalStatus().then((s: QuickTerminalStatus) => setStatus(s ?? IDLE));
  }, [local]);

  if (!local) return null;

  const apply = async (on: boolean, nextKey: string) => {
    setBusy(true);
    try {
      const next: QuickTerminalStatus = (await SetQuickTerminal(on, nextKey)) ?? IDLE;
      setStatus(next);
      await update({ quickTerminal: { enabled: on && next.registered, key: nextKey } });
    } finally {
      setBusy(false);
    }
  };

  const changeKey = (nextKey: string) => {
    if (enabled) {
      void apply(true, nextKey);
      return;
    }
    setStatus(IDLE);
    void update({ quickTerminal: { enabled: false, key: nextKey } });
  };

  return (
    <SettingsSection title="From any app">
      <SettingsRow
        {...rowProps("shortcut.quickTerminal")}
        below={
          status.problem && (
            <p className="mt-1 text-[11px] text-[var(--text-error,#e15252)]">
              {quickTerminalProblemText(status.problem, key)}
            </p>
          )
        }
      >
        <div className="flex items-start gap-2">
          {key !== fallback && (
            <button onClick={() => changeKey(fallback)} className={BTN_SECONDARY}>
              Reset
            </button>
          )}
          {/* Read by physical key and needing two of Ctrl/⌃, Alt/⌥ and ⌘/Win, so
              it can't take a chord other apps rely on. */}
          <ShortcutRecorder value={key} onChange={changeKey} capture={captureGlobalKey} label={globalKeyLabel} />
          <div className="pt-1.5">
            <Toggle
              aria-label="Quick terminal"
              enabled={enabled}
              disabled={busy}
              onChange={(on) => void apply(on, key)}
            />
          </div>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
