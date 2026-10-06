// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  window.__LPM_PLATFORM__ = "linux";
});

vi.mock("./useKeyboardShortcut", () => ({
  useKeyboardShortcut: vi.fn(),
}));

import { useYamlEditor } from "./useYamlEditor";

const load = vi.fn(async () => "first");
const save = vi.fn(async () => undefined);

function Harness() {
  const editor = useYamlEditor(load, save);
  return (
    <div>
      <textarea
        value={editor.content}
        onChange={(e) => editor.setContent(e.target.value)}
        onKeyDown={editor.handleSaveKey}
      />
      <button onClick={() => editor.setContent("second")}>Edit</button>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function press(mods: { ctrl?: boolean; shift?: boolean; alt?: boolean }) {
  const e = new KeyboardEvent("keydown", {
    key: mods.shift ? "S" : "s",
    code: "KeyS",
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    container.querySelector("textarea")!.dispatchEvent(e);
    await Promise.resolve();
  });
  return e;
}

describe("useYamlEditor off macOS", () => {
  it("saves on plain Ctrl+S inside the editor", async () => {
    await act(async () => container.querySelector("button")!.click());
    const e = await press({ ctrl: true });
    expect(e.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledWith("second");
  });

  it("does nothing on Ctrl+S with nothing to save", async () => {
    const e = await press({ ctrl: true });
    expect(e.defaultPrevented).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("leaves other chords alone", async () => {
    await act(async () => container.querySelector("button")!.click());
    expect((await press({ ctrl: true, alt: true })).defaultPrevented).toBe(false);
    expect((await press({})).defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
