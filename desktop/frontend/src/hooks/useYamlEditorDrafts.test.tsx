// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useYamlEditor } from "./useYamlEditor";

type Editor = ReturnType<typeof useYamlEditor>;

let container: HTMLDivElement;
let root: Root;
let editor: Editor;
let onDisk: string;

const load = () => Promise.resolve(onDisk);
const save = async (content: string) => {
  onDisk = content;
};

function Harness({ draftKey }: { draftKey?: string }) {
  editor = useYamlEditor(load, save, undefined, draftKey);
  return null;
}

async function open(draftKey?: string) {
  await act(async () => root.render(<Harness key={Math.random()} draftKey={draftKey} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onDisk = "name: app\n";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useYamlEditor drafts", () => {
  it("brings unsaved edits back when the same file is opened again", async () => {
    await open("config:app");
    act(() => editor.setContent("name: app\nlabel: Draft\n"));
    await open("config:app");
    expect(editor.content).toBe("name: app\nlabel: Draft\n");
    expect(editor.dirty).toBe(true);
  });

  it("drops the draft once it is saved or discarded", async () => {
    await open("config:saved");
    act(() => editor.setContent("name: saved\n"));
    await act(() => editor.handleSave());
    await open("config:saved");
    expect(editor.dirty).toBe(false);

    act(() => editor.setContent("name: other\n"));
    act(() => editor.discard());
    await open("config:saved");
    expect(editor.content).toBe("name: saved\n");
  });

  it("drops a draft whose file changed on disk meanwhile", async () => {
    await open("config:changed");
    act(() => editor.setContent("name: mine\n"));
    onDisk = "name: theirs\n";
    await open("config:changed");
    expect(editor.content).toBe("name: theirs\n");
    expect(editor.dirty).toBe(false);
  });

  it("keeps nothing without a draft key", async () => {
    await open();
    act(() => editor.setContent("name: lost\n"));
    await open();
    expect(editor.content).toBe("name: app\n");
  });
});
