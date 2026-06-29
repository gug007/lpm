export type TipSegment = string | { kbd: string };

export interface AppTip {
  id: string;
  segments: TipSegment[];
  // Only surface this tip when the target terminal runs an AI CLI that exposes
  // slash commands — showing it for a plain shell would be misleading.
  requiresCli?: boolean;
}

export const APP_TIPS: AppTip[] = [
  { id: "toggle-input", segments: ["Press ", { kbd: "⌘I" }, " to show or hide the message input"] },
  { id: "newline", segments: ["Press ", { kbd: "⇧↵" }, " to add a new line without sending"] },
  { id: "history", segments: ["Press ", { kbd: "↑" }, " at the input start to recall past messages"] },
  { id: "mention", segments: ["Type ", { kbd: "@" }, " to mention files, branches, changes, or terminals"] },
  { id: "slash", segments: ["Type ", { kbd: "/" }, " to run an agent's slash commands with hints"], requiresCli: true },
  { id: "esc-focus", segments: ["Press ", { kbd: "Esc" }, " to jump back to the terminal, input still open"] },
  { id: "attach", segments: ["Drag in a file or paste an image to attach it to a message"] },
  { id: "new-terminal", segments: ["Press ", { kbd: "⌘T" }, " to open a fresh terminal tab"] },
  { id: "close-tab", segments: ["Press ", { kbd: "⌘W" }, " to close the active terminal tab"] },
  { id: "pin-tab", segments: ["Right-click a tab and Pin it to block an accidental ", { kbd: "⌘W" }] },
  { id: "path-preview", segments: ["Click any file path in terminal output to preview it"] },
  { id: "zoom", segments: ["Resize terminal text with ", { kbd: "⌘+" }, " and ", { kbd: "⌘−" }] },
  { id: "split", segments: ["Split a pane with ", { kbd: "⌘D" }, " sideways or ", { kbd: "⌘⇧D" }, " stacked"] },
  { id: "move-tab", segments: ["Drag a tab into another pane to rearrange your workspace"] },
  { id: "search", segments: ["Search output with ", { kbd: "⌘F" }, " · ", { kbd: "↵" }, " next, ", { kbd: "⇧↵" }, " previous"] },
  { id: "review-diff", segments: ["Press ", { kbd: "⌘⇧R" }, " to review changed files in a diff tab"] },
  { id: "ai-commit", segments: ["Generate a commit message from your diff with AI"] },
  { id: "review-changes", segments: ["Hit Review Changes to scan your diff before committing"] },
  { id: "smart-sync", segments: ["Use the branch sync button to pull or push in one click"] },
  { id: "resolve-conflicts", segments: ["Resolve merge conflicts fast with AI"] },
  { id: "switch-project", segments: ["Press ", { kbd: "⌘1" }, "–", { kbd: "⌘9" }, " to jump straight to a project"] },
  { id: "bulk-duplicate", segments: ["Right-click a project and Duplicate to work in parallel"] },
  { id: "forward-ports", segments: ["Open Ports to forward a running service to localhost"] },
  { id: "sidebar", segments: ["Toggle the sidebar with ", { kbd: "⌘B" }] },
  { id: "sound-alerts", segments: ["Turn on sound alerts for when agents finish or need approval"] },
  { id: "ai-config", segments: ["Let AI scaffold a project's config in the editor"] },
  { id: "config-templates", segments: ["Share setups across projects with config templates"] },
  { id: "mic-dictate", segments: ["Tap the mic to dictate a message instead of typing"] },
];

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
