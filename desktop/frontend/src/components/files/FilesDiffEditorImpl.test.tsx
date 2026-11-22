// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, expect, it, vi } from "vitest";
import type * as monacoNs from "monaco-editor";

vi.mock("../../../bridge/commands", () => ({}));
vi.mock("../../monaco-setup", async () => {
  const monaco = await import("monaco-editor");
  return { setupMonaco: () => monaco };
});

let monaco: typeof monacoNs;
let FilesDiffEditor: typeof import("./FilesDiffEditorImpl").FilesDiffEditor;

// Loading Monaco takes several seconds on a cold CI runner, past the 5 s test
// timeout, so it gets its own budget.
beforeAll(async () => {
  // Monaco paints its rulers on a canvas once the diff lands; happy-dom has none.
  const context = new Proxy({ measureText: () => ({ width: 8 }) } as Record<string | symbol, unknown>, {
    get: (target, prop) => (prop in target || prop === "then" ? target[prop] : () => {}),
  });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
  monaco = await import("monaco-editor");
  ({ FilesDiffEditor } = await import("./FilesDiffEditorImpl"));
}, 60_000);

it("disposes the diff view model when the editor goes away", async () => {
  const viewModels: monacoNs.editor.IDiffEditorViewModel[] = [];
  const disposed: boolean[] = [];
  const createDiffEditor = monaco.editor.createDiffEditor;
  const spy = vi.spyOn(monaco.editor, "createDiffEditor").mockImplementation((...args) => {
    const editor = createDiffEditor(...args);
    const createViewModel = editor.createViewModel.bind(editor);
    editor.createViewModel = (model) => {
      const viewModel = createViewModel(model);
      viewModels.push(viewModel);
      const index = disposed.push(false) - 1;
      const dispose = viewModel.dispose.bind(viewModel);
      viewModel.dispose = () => {
        disposed[index] = true;
        dispose();
      };
      return viewModel;
    };
    return editor;
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <FilesDiffEditor
        path="notes.txt"
        original={"a\n"}
        value={"b\n"}
        onChange={() => {}}
        onSave={() => {}}
        readOnly={false}
      />,
    ),
  );
  await act(() => viewModels[0].waitForDiff());
  act(() => root.unmount());
  container.remove();
  spy.mockRestore();

  expect(disposed).toEqual([true]);
});

it("still frees the diff when Monaco throws detaching it", async () => {
  // @ts-expect-error monaco-editor ships no types for the module that reports its own bugs
  const { errorHandler } = await import("monaco-editor/esm/vs/base/common/errors.js");
  const unexpected: string[] = [];
  const handle = errorHandler.unexpectedErrorHandler;
  errorHandler.unexpectedErrorHandler = (e: Error) => unexpected.push(e.message);
  const viewModels: monacoNs.editor.IDiffEditorViewModel[] = [];
  const disposed: boolean[] = [];
  const createDiffEditor = monaco.editor.createDiffEditor;
  const spy = vi.spyOn(monaco.editor, "createDiffEditor").mockImplementation((...args) => {
    const editor = createDiffEditor(...args);
    const setModel = editor.setModel.bind(editor);
    editor.setModel = (model) => {
      if (!model) throw new Error("mid-teardown");
      setModel(model);
    };
    const createViewModel = editor.createViewModel.bind(editor);
    editor.createViewModel = (model) => {
      const viewModel = createViewModel(model);
      viewModels.push(viewModel);
      const index = disposed.push(false) - 1;
      const dispose = viewModel.dispose.bind(viewModel);
      viewModel.dispose = () => {
        disposed[index] = true;
        dispose();
      };
      return viewModel;
    };
    return editor;
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <FilesDiffEditor
        path="notes.txt"
        original={"a\n"}
        value={"b\n"}
        onChange={() => {}}
        onSave={() => {}}
        readOnly={false}
      />,
    ),
  );
  await act(() => viewModels[0].waitForDiff());
  act(() => root.unmount());
  container.remove();
  spy.mockRestore();
  errorHandler.unexpectedErrorHandler = handle;

  expect(disposed).toEqual([true]);
  expect(unexpected).toEqual([]);
});
