import { setupMonaco } from "../../monaco-setup";

// The text selected in `root`'s editor (the focused one, else the last, which
// is a diff's editable side) or its Markdown preview; "" unless it is on one
// line.
export function selectedText(root: HTMLElement | null): string {
  if (!root) return "";
  const editors = setupMonaco()
    .editor.getEditors()
    .filter((e) => root.contains(e.getContainerDomNode()));
  const editor = editors.find((e) => e.hasTextFocus()) ?? editors[editors.length - 1];
  const range = editor?.getSelection();
  let text = "";
  if (editor && range && !range.isEmpty()) {
    text = editor.getModel()?.getValueInRange(range) ?? "";
  } else {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && root.contains(selection.anchorNode)) text = selection.toString();
  }
  return text.includes("\n") ? "" : text;
}
