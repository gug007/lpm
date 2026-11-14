import { describe, expect, it, vi } from "vitest";
import type * as monacoNs from "monaco-editor";
import { withLegacyWorkerOptions } from "./monacoLegacyWorkers";

function fakeMonaco() {
  const createWebWorker = vi.fn(() => "client");
  const monaco = { languages: { register: vi.fn() }, editor: { createWebWorker, getModels: vi.fn() } };
  return { monaco: monaco as unknown as typeof monacoNs, createWebWorker };
}

function fakeWorker() {
  return { postMessage: vi.fn() } as unknown as Worker & { postMessage: ReturnType<typeof vi.fn> };
}

describe("withLegacyWorkerOptions", () => {
  it("starts a worker from a label and its create data, as Monaco's own languages do", () => {
    const { monaco, createWebWorker } = fakeMonaco();
    const worker = fakeWorker();
    const getWorker = vi.fn(() => worker);
    const host = { ping: () => "pong" };

    const wrapped = withLegacyWorkerOptions(monaco, getWorker);
    const client = wrapped.editor.createWebWorker({
      label: "yaml",
      moduleId: "vs/language/yaml/yamlWorker",
      createData: { validate: true },
      host,
    } as unknown as monacoNs.editor.IInternalWebWorkerOptions);

    expect(client).toBe("client");
    expect(getWorker).toHaveBeenCalledWith("yaml");
    expect(worker.postMessage.mock.calls).toEqual([["ignore"], [{ validate: true }]]);
    expect(createWebWorker).toHaveBeenCalledWith({ worker, host, keepIdleModels: undefined });
  });

  it("passes a worker it was given straight through", () => {
    const { monaco, createWebWorker } = fakeMonaco();
    const worker = fakeWorker();
    const getWorker = vi.fn();

    withLegacyWorkerOptions(monaco, getWorker).editor.createWebWorker({ worker, keepIdleModels: true });

    expect(getWorker).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(createWebWorker).toHaveBeenCalledWith({ worker, host: undefined, keepIdleModels: true });
  });

  it("leaves the rest of Monaco as it was", () => {
    const { monaco } = fakeMonaco();
    const wrapped = withLegacyWorkerOptions(monaco, vi.fn());

    expect(wrapped.languages).toBe(monaco.languages);
    expect(wrapped.editor.getModels).toBe(monaco.editor.getModels);
    expect(monaco.editor.createWebWorker).not.toBe(wrapped.editor.createWebWorker);
  });
});
