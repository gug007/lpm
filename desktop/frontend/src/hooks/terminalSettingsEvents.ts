// Broadcast terminal settings changes (font size, theme) to mounted
// hooks so updates from one entry point — modal or Settings page —
// propagate to every TerminalView already on screen.
export const TERMINAL_SETTINGS_CHANGED_EVENT = "lpm:terminal-settings-changed";

export function notifyTerminalSettingsChanged(): void {
  window.dispatchEvent(new Event(TERMINAL_SETTINGS_CHANGED_EVENT));
}
