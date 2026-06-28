import type * as monacoNs from "monaco-editor";

type Monaco = typeof monacoNs;

export const MONACO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
export const DEFAULT_MONACO_FONT_SIZE = 13;

export function currentMonacoTheme(): "lpm-dark" | "lpm-light" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "lpm-dark"
    : "lpm-light";
}

const baseColors = {
  "editor.background": "#00000000",
  "editorGutter.background": "#00000000",
  "minimap.background": "#00000000",
  "scrollbarSlider.background": "#80808033",
  "scrollbarSlider.hoverBackground": "#80808055",
  "scrollbarSlider.activeBackground": "#80808077",
  focusBorder: "#00000000",
};

// The diffEditor.* keys mirror globals.css --accent-green / --accent-red for
// each theme. Monaco cannot read var(--token) at registration time, so these
// hex values must be updated if those tokens change.
const darkDiffColors = {
  "diffEditor.insertedTextBackground": "#4ade8026",
  "diffEditor.insertedLineBackground": "#4ade8014",
  "diffEditor.removedTextBackground": "#f8717126",
  "diffEditor.removedLineBackground": "#f8717114",
  "diffEditorGutter.insertedLineBackground": "#4ade8033",
  "diffEditorGutter.removedLineBackground": "#f8717133",
  "diffEditor.diagonalFill": "#80808019",
};

const lightDiffColors = {
  "diffEditor.insertedTextBackground": "#22c55e26",
  "diffEditor.insertedLineBackground": "#22c55e14",
  "diffEditor.removedTextBackground": "#ef444426",
  "diffEditor.removedLineBackground": "#ef444414",
  "diffEditorGutter.insertedLineBackground": "#22c55e33",
  "diffEditorGutter.removedLineBackground": "#ef444433",
  "diffEditor.diagonalFill": "#80808019",
};

let themesDefined = false;

export function defineMonacoThemes(monaco: Monaco) {
  if (themesDefined) return;
  themesDefined = true;
  monaco.editor.defineTheme("lpm-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: { ...baseColors, ...darkDiffColors },
  });
  monaco.editor.defineTheme("lpm-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: { ...baseColors, ...lightDiffColors },
  });
}

// Apply the current theme and keep it in sync with the app's data-theme
// attribute. Returns a disposer. monaco.editor.setTheme is global, so a single
// shared MutationObserver re-themes every editor — this is ref-counted so a
// stack of N editors installs one observer, not N.
let themeObserver: MutationObserver | null = null;
let themeRefs = 0;

export function observeMonacoTheme(monaco: Monaco): () => void {
  monaco.editor.setTheme(currentMonacoTheme());
  themeRefs += 1;
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(currentMonacoTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    themeRefs -= 1;
    if (themeRefs <= 0) {
      themeObserver?.disconnect();
      themeObserver = null;
      themeRefs = 0;
    }
  };
}
