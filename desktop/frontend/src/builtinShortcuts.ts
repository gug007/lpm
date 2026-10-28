import { chordLabel, type Chord } from "./keys";
import { revealLabel } from "./machineWords";
import { isMac } from "./platform";
import { enterHint, primaryHint } from "./shortcutHints";

export interface BuiltinShortcut {
  id: string;
  label: string;
  description: string;
  keys: string;
}

export interface BuiltinShortcutGroup {
  id: string;
  title: string;
  shortcuts: BuiltinShortcut[];
  // Read-aloud keys exist only while the experimental voice is turned on.
  tts?: boolean;
}

const cmd = (key: string, mods: Omit<Chord, "key"> = {}) => chordLabel({ key, meta: true, ...mods });

// Every fixed shortcut, as the handlers that own them match it (App.tsx,
// TerminalView.tsx, useDetailView.ts, useFilesChords.ts, TerminalComposer.tsx,
// useTTSHotkeys.ts). Settings › Shortcuts lists them under the ones you can
// change; reservedShortcuts() keeps a recorded shortcut off all of them.
export const BUILTIN_SHORTCUT_GROUPS: BuiltinShortcutGroup[] = [
  {
    id: "projects",
    title: "Projects",
    shortcuts: [
      { id: "jump-project", label: "Jump to a project", description: "The first nine in the sidebar, in order", keys: `${cmd("1")} – ${cmd("9")}` },
      { id: "sidebar", label: "Show or hide the sidebar", description: "Gives the terminals the whole window", keys: cmd("b") },
      { id: "config", label: "Edit the project's config", description: "Press again to go back to its terminals", keys: cmd("e") },
      { id: "notes", label: "Project notes", description: "Press again to go back to its terminals", keys: cmd("n", { shift: true }) },
    ],
  },
  {
    id: "tabs",
    title: "Tabs and panes",
    shortcuts: [
      { id: "new-tab", label: "New terminal tab", description: "Opens in the focused pane", keys: cmd("t") },
      { id: "close-tab", label: "Close tab", description: "A pinned tab stays open", keys: cmd("w") },
      { id: "archive-agent", label: "Archive the agent on screen", description: "Takes its sidebar row away, the tab stays open", keys: cmd("a", { shift: true }) },
      { id: "split-right", label: "Split sideways", description: "A new pane to the right", keys: cmd("d") },
      { id: "split-down", label: "Split stacked", description: "A new pane below", keys: cmd("d", { shift: true }) },
      { id: "search", label: "Search the output", description: `${enterHint()} for the next match, ${enterHint({ shift: true })} for the previous`, keys: cmd("f") },
      { id: "zoom", label: "Bigger or smaller text", description: "In the terminal", keys: `${cmd("+")}  ${isMac ? "⌘−" : "Ctrl+-"}` },
      { id: "skills", label: "Skills and tools", description: "Opens or closes the tab", keys: cmd("k", { shift: true }) },
      { id: "memory", label: "Memory", description: "Opens or closes the tab", keys: cmd("m", { shift: true }) },
      { id: "automations", label: "Automations", description: "Opens or closes the tab", keys: cmd("j", { shift: true }) },
    ],
  },
  {
    id: "files",
    title: "Files and changes",
    shortcuts: [
      { id: "review", label: "Review every change", description: "All uncommitted changes as one diff", keys: cmd("r", { shift: true }) },
      { id: "files", label: "Browse project files", description: "Opens or closes the Files tab", keys: cmd("e", { shift: true }) },
      { id: "go-to-file", label: "Jump to a file by name", description: "Opens the Files tab with its filter ready", keys: cmd("p") },
      { id: "search-files", label: "Search in files", description: "Every occurrence in the project, in the Files tab", keys: cmd("f", { shift: true }) },
      { id: "save", label: "Save the file", description: "In the Files tab", keys: primaryHint("s") },
      { id: "preview", label: "Markdown preview or source", description: "In the Files tab", keys: cmd("v", { shift: true }) },
      { id: "step-files", label: "Next or previous file", description: "In the Files and review tabs", keys: isMac ? "⌃⌥↓  ⌃⌥↑" : "Ctrl+Alt+PgDn  Ctrl+Alt+PgUp" },
      { id: "reveal", label: revealLabel(), description: "The open file", keys: cmd("r", { alt: true }) },
      { id: "copy-path", label: "Copy the file's path", description: "Add ⇧ for the path inside the project", keys: cmd("c", { alt: true }) },
    ],
  },
  {
    id: "input",
    title: "Message input",
    shortcuts: [
      { id: "toggle-input", label: "Show or hide the input", description: "Under the focused terminal", keys: cmd("i") },
      { id: "newline", label: "New line", description: "Without sending", keys: enterHint({ shift: true }) },
      { id: "send-later", label: "Send later", description: "Pick a time to send the message", keys: enterHint({ alt: true }) },
      { id: "send-when-done", label: "Send when done", description: "Sends once the agent finishes its turn", keys: enterHint({ alt: true, shift: true }) },
      { id: "recall", label: "Recall past messages", description: "At the start of the input", keys: "↑" },
      { id: "back-to-terminal", label: "Back to the terminal", description: "The input stays open", keys: "Esc" },
    ],
  },
  {
    id: "read-aloud",
    title: "Read aloud",
    tts: true,
    shortcuts: [
      { id: "read", label: "Read the selection", description: "Selected terminal text", keys: cmd("l", { shift: true }) },
      { id: "pause", label: "Pause or resume", description: "While reading", keys: cmd("p", { shift: true }) },
      { id: "stop", label: "Stop reading", description: "While reading", keys: cmd("s", { shift: true }) },
    ],
  },
];

export function builtinShortcutGroups(tts: boolean): BuiltinShortcutGroup[] {
  return BUILTIN_SHORTCUT_GROUPS.filter((group) => tts || !group.tts);
}
