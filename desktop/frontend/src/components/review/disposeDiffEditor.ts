import type * as monacoNs from "monaco-editor";

// Detaching the diff model first lets hideUnchangedRegions tear down its
// autoruns before the editor goes. Monaco can throw partway through, so every
// step runs even when the one before it threw: a view model left running keeps
// diffing models about to be freed ("no diff result available"), and an editor
// left alive still watches them ("TextModel got disposed before DiffEditorWidget
// model got reset").
export function disposeDiffEditor(
  editor: monacoNs.editor.IStandaloneDiffEditor,
  viewModel: monacoNs.editor.IDiffEditorViewModel | null,
): void {
  const steps = [() => editor.setModel(null), () => viewModel?.dispose(), () => editor.dispose()];
  for (const step of steps) {
    try {
      step();
    } catch {
      // Monaco can throw mid-teardown of its diff observables.
    }
  }
}
