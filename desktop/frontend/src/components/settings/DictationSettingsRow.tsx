import { useEffect, useState } from "react";
import { VoiceToTextAvailable } from "../../../bridge/commands";
import { useDictateShortcut } from "../../hooks/useDictateShortcut";
import { useEventListener } from "../../hooks/useEventListener";
import { useVoiceDictation } from "../../hooks/useVoiceDictation";
import { ROWS, rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";
import { VoiceToTextInstallModal } from "../VoiceToTextInstallModal";
import { DictationTryField } from "./DictationTryField";
import { HotkeyEditor } from "./HotkeyEditor";

/** Settings › Agents › Dictation: whether VoiceToText is there, the shortcut,
 *  and a field to try it in. */
export function DictationSettingsRow() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [tryRun, setTryRun] = useState(0);
  const { toggle, active, installOpen, setInstallOpen } = useVoiceDictation();
  const { label: shortcutLabel } = useDictateShortcut();

  const check = () => {
    VoiceToTextAvailable()
      .then((there: boolean) => setInstalled(there))
      .catch(() => setInstalled(false));
  };
  useEffect(check, []);
  useEventListener("focus", check, window);

  const tryIt = () => {
    if (installed === false) {
      setInstallOpen(true);
      return;
    }
    setTryRun((n) => n + 1);
  };

  return (
    <>
      <SettingsRow
        {...rowProps("ai.voiceToText")}
        description={
          <>
            {ROWS["ai.voiceToText"].description}
            {installed !== null && (
              <span className={installed ? "text-[var(--accent-green-text)]" : "text-[var(--text-secondary)]"}>
                {" · "}
                {installed ? "Installed" : "Not installed"}
              </span>
            )}
          </>
        }
        footer={
          <>
            {tryRun > 0 && installed !== false && (
              <DictationTryField key={tryRun} shortcutLabel={shortcutLabel} onReady={(field) => void toggle(field)} />
            )}
            <VoiceToTextInstallModal
              open={installOpen}
              onClose={() => {
                setInstallOpen(false);
                check();
              }}
              onInstalled={() => {
                setInstallOpen(false);
                setInstalled(true);
                setTryRun((n) => n + 1);
              }}
            />
          </>
        }
      >
        <button type="button" onClick={tryIt} disabled={active} className={BTN_SECONDARY}>
          {installed === false ? "Install…" : "Try it"}
        </button>
      </SettingsRow>
      <SettingsRow nested label="Shortcut" description="In any input, or in a terminal to speak into its input">
        <div className={`transition-opacity ${installed === false ? "opacity-50" : ""}`}>
          <HotkeyEditor id="dictate" />
        </div>
      </SettingsRow>
    </>
  );
}
