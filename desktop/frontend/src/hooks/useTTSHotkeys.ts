import { useKeyboardShortcut } from "./useKeyboardShortcut";
import { getTerminalSelection } from "./useTerminalSelection";
import { useTTSStore } from "../store/tts";
import { getSettings } from "../store/settings";

export function useTTSHotkeys(terminalId: string | null) {
  const status = useTTSStore((s) => s.status);
  const startReading = useTTSStore((s) => s.startReading);
  const stopReading = useTTSStore((s) => s.stopReading);
  const togglePause = useTTSStore((s) => s.togglePause);

  useKeyboardShortcut(
    { key: "r", meta: true, shift: true },
    () => {
      if (!terminalId || !getSettings().experimentalTTS || !getSettings().ttsEnabled) return;
      const text = getTerminalSelection(terminalId);
      if (text) startReading(text);
    },
  );

  useKeyboardShortcut(
    { key: "s", meta: true, shift: true },
    () => stopReading(),
    status !== "idle",
  );

  useKeyboardShortcut(
    { key: "p", meta: true, shift: true },
    () => togglePause(),
    status === "playing" || status === "paused",
  );
}
