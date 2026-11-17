import type * as monacoNs from "monaco-editor";
import { parseDocument } from "yaml";
import { chordLabel } from "./keys";

// The editor's own Shift+Alt+F, as the platform writes it: "⌥⇧F" / "Alt+Shift+F".
export function formatShortcutLabel(): string {
  return chordLabel({ key: "f", shift: true, alt: true });
}

// Re-indents the editor's YAML in one undoable edit; leaves text that doesn't
// parse alone.
export function formatYamlInEditor(editor: monacoNs.editor.ICodeEditor): void {
  const model = editor.getModel();
  if (!model) return;
  const current = model.getValue();
  let formatted: string;
  try {
    const doc = parseDocument(current);
    if (doc.errors.length > 0) return;
    formatted = doc.toString({ indent: 2, lineWidth: 0 });
  } catch {
    return;
  }
  if (formatted === current) return;
  editor.executeEdits("format", [
    { range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true },
  ]);
  editor.pushUndoStop();
}
