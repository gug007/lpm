// @vitest-environment happy-dom
import { beforeAll, expect, it, vi } from "vitest";
import type * as monacoNs from "monaco-editor";
import { makeDiffModels } from "./reviewSource";

vi.mock("../../../bridge/commands", () => ({}));

let monaco: typeof monacoNs;
const errors: string[] = [];

// Loading Monaco takes several seconds on a cold CI runner, past the 5 s test
// timeout, so it gets its own budget.
beforeAll(async () => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: () => ({ width: 8 }),
    clearRect: () => {},
    font: "",
  })) as never;
  monaco = await import("monaco-editor");
  // @ts-expect-error Monaco ships no types for its internals
  const { errorHandler } = await import("monaco-editor/esm/vs/base/common/errors");
  errorHandler.unexpectedErrorHandler = (e: unknown) => errors.push(String(e));
}, 60_000);

it("gives a second view of the same path its own models", () => {
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
