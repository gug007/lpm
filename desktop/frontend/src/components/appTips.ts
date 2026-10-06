import { resolveHotkey, type HotkeyId } from "../hotkeys";
import { chordLabel, type Chord } from "../keys";
import { isMac } from "../platform";
import { enterHint } from "../shortcutHints";
import { parseShortcut } from "../shortcutParse";

export type TipSegment = string | { kbd: string };

export interface AppTip {
  id: string;
  segments: TipSegment[];
  // Only surface this tip when the target terminal runs an AI CLI that exposes
  // slash commands — showing it for a plain shell would be misleading.
  requiresCli?: boolean;
  macOnly?: boolean;
}

const cmd = (key: string, mods: Omit<Chord, "key"> = {}) => ({ kbd: chordLabel({ key, meta: true, ...mods }) });
const enter = (mods: Omit<Chord, "key"> = {}) => ({ kbd: enterHint(mods) });

function hotkey(id: HotkeyId) {
  const parsed = parseShortcut(resolveHotkey(undefined, id));
  return { kbd: parsed ? chordLabel(parsed) : "" };
}

const ALL_TIPS: AppTip[] = [
  { id: "toggle-input", segments: ["Press ", cmd("i"), " to show or hide the message input"] },
  { id: "newline", segments: ["Press ", enter({ shift: true }), " to add a new line without sending"] },
  { id: "history", segments: ["Press ", { kbd: "↑" }, " at the input start to recall past messages"] },
  { id: "mention", segments: ["Type ", { kbd: "@" }, " to mention files, branches, changes, or terminals"] },
  { id: "slash", segments: ["Type ", { kbd: "/" }, " to run an agent's slash commands with hints"], requiresCli: true },
  { id: "esc-focus", segments: ["Press ", { kbd: "Esc" }, " to jump back to the terminal, input still open"] },
  { id: "attach", segments: ["Drag in a file or paste an image to attach it to a message"] },
  { id: "new-terminal", segments: ["Press ", cmd("t"), " to open a fresh terminal tab"] },
  { id: "close-tab", segments: ["Press ", cmd("w"), " to close the active terminal tab"] },
  { id: "cycle-tabs", segments: ["Press ", hotkey("tabSwitchPrev"), " / ", hotkey("tabSwitchNext"), " to jump between terminals and services"] },
  { id: "pin-tab", segments: ["Right-click a tab and Pin it to block an accidental ", cmd("w")] },
  { id: "path-preview", segments: ["Click any file path in terminal output to preview it"] },
  { id: "zoom", segments: ["Resize terminal text with ", cmd("+"), " and ", { kbd: isMac ? "⌘−" : "Ctrl+-" }] },
  { id: "split", segments: ["Split a pane with ", cmd("d"), " sideways or ", cmd("d", { shift: true }), " stacked"] },
  { id: "move-tab", segments: ["Drag a tab into another pane to rearrange your workspace"] },
  { id: "search", segments: ["Search output with ", cmd("f"), " · ", enter(), " next, ", enter({ shift: true }), " previous"] },
  { id: "review-diff", segments: ["Press ", cmd("r", { shift: true }), " to review every uncommitted change as one diff"] },
  { id: "files-tab", segments: ["Press ", cmd("e", { shift: true }), " to browse project files, or ", cmd("p"), " to jump to one by name"] },
  { id: "ai-commit", segments: ["Generate a commit message from your diff with AI"] },
  { id: "review-changes", segments: ["Hit Review Changes to scan your diff before committing"] },
  { id: "smart-sync", segments: ["Use the branch sync button to pull or push in one click"] },
  { id: "resolve-conflicts", segments: ["Resolve merge conflicts fast with AI"] },
  { id: "switch-project", segments: ["Press ", cmd("1"), "–", cmd("9"), " to jump straight to a project"] },
  { id: "bulk-duplicate", segments: ["Right-click a project and Duplicate to work in parallel"] },
  { id: "forward-ports", segments: ["Open Ports to forward a running service to localhost"] },
  { id: "sidebar", segments: ["Toggle the sidebar with ", cmd("b")] },
  { id: "sound-alerts", segments: ["Turn on sound alerts for when agents finish or need approval"] },
  { id: "ai-config", segments: ["Let AI scaffold a project's config in the editor"] },
  { id: "config-templates", segments: ["Share setups across projects with config templates"] },
  { id: "mic-dictate", segments: ["Tap the mic to dictate a message instead of typing"], macOnly: true },
];

export const APP_TIPS: AppTip[] = ALL_TIPS.filter((tip) => isMac || !tip.macOnly);

// A per-mount shuffle keeps the first tip from always being the same one.
export function shuffledTips(tips: AppTip[], seed: number): AppTip[] {
  const out = tips.slice();
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
