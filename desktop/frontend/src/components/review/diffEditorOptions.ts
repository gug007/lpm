import type * as monacoNs from "monaco-editor";

// Editor features that are pure cost in a read-heavy stacked diff and add no
// value when scanning changes. Stacked editors spread these so a window of
// editors stays cheap; the single-file pane keeps the richer defaults.
export const READ_HEAVY_DIFF_OPTIONS: monacoNs.editor.IStandaloneDiffEditorConstructionOptions =
  {
    folding: false,
    codeLens: false,
    links: false,
    hover: { enabled: false },
    occurrencesHighlight: "off",
    selectionHighlight: false,
    matchBrackets: "never",
    renderValidationDecorations: "off",
    guides: { indentation: false },
    stickyScroll: { enabled: false },
    contextmenu: false,
    colorDecorators: false,
    renderLineHighlight: "none",
    // The hunk gutter has no actions in standalone Monaco, yet its renderer
    // forces a layout on every editor change; the EditContext input does the
    // same to place its bounds. Both are pure cost in a stacked diff.
    renderGutterMenu: false,
    editContext: false,
  };
