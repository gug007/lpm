import { hotkeyTakes } from "../../hotkeys";
import { actionTakes } from "../../hooks/useActionShortcuts";
import { useKeyboardShortcut, type KeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { useAppStore } from "../../store/app";
import { useSettingsStore } from "../../store/settings";
import { usePortsFollowProjects } from "./usePortsFollowProjects";
import { usePortsPolling } from "./usePortsPolling";

const PORTS_CHORD: KeyboardShortcut = {
  key: "y",
  meta: true,
  shift: false,
  alt: false,
  cmdOnly: true,
  preventDefault: false,
};

// The main window's part in the Ports view: ⌘Y in and back out, and a slow read
// while the view itself isn't reading faster. An action or a hotkey already on
// ⌘Y keeps it.
export function usePortsWiring(): void {
  const showing = useAppStore((s) => s.view === "ports");
  const setView = useAppStore((s) => s.setView);
  useKeyboardShortcut(PORTS_CHORD, (event) => {
    if (actionTakes(PORTS_CHORD) || hotkeyTakes(useSettingsStore.getState().hotkeys, PORTS_CHORD)) return;
    event.preventDefault();
    setView(showing ? "projects" : "ports");
  });
  usePortsPolling(60_000, !showing);
  usePortsFollowProjects();
}
