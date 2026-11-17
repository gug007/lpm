// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

vi.mock("../../../bridge/commands", () => ({}));

it("gives a second view of the same path its own models", async () => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: () => ({ width: 8 }),
    clearRect: () => {},
    font: "",
  })) as never;
  const monaco = await import("monaco-editor");
  // @ts-expect-error Monaco ships no types for its internals
  const { errorHandler } = await import("monaco-editor/esm/vs/base/common/errors");
  const { makeDiffModels } = await import("./reviewSource");
  const errors: string[] = [];
  errorHandler.unexpectedErrorHandler = (e: unknown) => errors.push(String(e));

  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = monaco.editor.createDiffEditor(host, {});
  const first = makeDiffModels(monaco, "working", "src/a.ts", "a\n", "b\n");
  editor.setModel(first);

  const second = makeDiffModels(monaco, "working", "src/a.ts", "a\n", "c\n");

  expect(errors).toEqual([]);
  expect(first.original.isDisposed()).toBe(false);
  expect(first.modified.isDisposed()).toBe(false);
  expect(second.modified.getValue()).toBe("c\n");
  expect(first.modified.getLanguageId()).toBe(second.modified.getLanguageId());
});
