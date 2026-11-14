import { useEffect, useState } from "react";
import { VoiceToTextAvailable } from "../../../bridge/commands";
import { useDictateShortcut } from "../../hooks/useDictateShortcut";
import { useEventListener } from "../../hooks/useEventListener";
import { useVoiceDictation } from "../../hooks/useVoiceDictation";
import { rowProps } from "../../settings-registry";
import { useAppStore } from "../../store/app";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";
import { VoiceToTextInstallModal } from "../VoiceToTextInstallModal";
import { DictationTryField } from "./DictationTryField";
import { revealSettingsRow } from "./revealSettingsRow";

/** Settings › Agents › Dictation: whether VoiceToText is there, the shortcut,
 *  and a field to try it in. */
export function DictationSettingsRow() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [tryRun, setTryRun] = useState(0);
  const { toggle, active, installOpen, setInstallOpen } = useVoiceDictation();
  const { label: shortcutLabel } = useDictateShortcut();
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);

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
    <SettingsRow
      {...rowProps("ai.voiceToText")}
      description={
        <>
          Speak your prompts with VoiceToText, a separate Mac app.
          {shortcutLabel && (
            <>
              {" "}
              Press{" "}
              <kbd className="rounded border border-[var(--border)] px-1 text-[11px] font-medium text-[var(--text-secondary)]">
                {shortcutLabel}
              </kbd>{" "}
              in any input, or in a terminal to speak into its input.{" "}
              <button
                type="button"
                onClick={() => {
                  setSettingsTab("shortcuts");
                  revealSettingsRow("shortcut.dictate");
                }}
                className="font-medium text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
              >
                Change it
              </button>
            </>
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
      <div className="flex items-center gap-3">
        {installed !== null && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${installed ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"}`}
            />
            {installed ? "Installed" : "Not installed"}
          </span>
        )}
        <button type="button" onClick={tryIt} disabled={active} className={BTN_SECONDARY}>
          {installed === false ? "Install…" : "Try it"}
        </button>
      </div>
    </SettingsRow>
  );
}
