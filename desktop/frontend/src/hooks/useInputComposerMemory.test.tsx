// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readSessions = vi.fn();

// vi.mock hoists above any const, so the factories are inlined. `then` must
// stay undefined: a function there makes the mocked module thenable and
// vitest awaits it forever.
vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) =>
      prop === "then"
        ? undefined
        : prop === "ReadMemorySessions"
          ? (...args: unknown[]) => readSessions(...args)
          : vi.fn(),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));

import { useAppStore } from "../store/app";
import type { ProjectInfo } from "../types";
import {
  useInputComposerMemory,
  type InputComposerMemorySource,
  type InputComposerMemoryState,
} from "./useInputComposerMemory";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let highlight: () => void = () => {};
let preview: InputComposerMemoryState["preview"] = null;

function Harness({ source, text }: { source?: InputComposerMemorySource; text: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const state = useInputComposerMemory(source, editorRef);
  highlight = state.highlight;
  preview = state.preview;
  return (
    <div ref={editorRef} contentEditable suppressContentEditableWarning>
      {text}
    </div>
  );
}

async function render(text: string, source?: InputComposerMemorySource) {
  await act(async () => {
    root.render(<Harness source={source} text={text} />);
  });
}

const editor = () => container.querySelector<HTMLElement>("[contenteditable]")!;
const command = () => editor().querySelector<HTMLElement>("[data-cmd]");
const pill = () => editor().querySelector<HTMLElement>(".composer-memchip-id");

const SOURCE: InputComposerMemorySource = { project: "web", agent: "claude" };

beforeEach(() => {
  useAppStore.setState({ projects: [{ name: "web", isRemote: false } as ProjectInfo] });
  readSessions.mockReset();
  readSessions.mockResolvedValue({
    sessions: [{ name: "auth-refactor", title: "Rework login", updatedAt: 0, content: "" }],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useInputComposerMemory", () => {
  it("draws the invocation and a saved session as one pill", async () => {
    await render("/lpm-memory auth-refactor continue", SOURCE);

    expect(command()?.textContent).toBe("/lpm-memory ");
    expect(command()?.dataset.memchip).toBe("auth-refactor");
    expect(pill()?.textContent).toBe("auth-refactor");
    expect(editor().textContent).toBe("/lpm-memory auth-refactor continue");
  });

  it("colors Codex's skill mention too", async () => {
    await render("$lpm-memory auth-refactor", { project: "web", agent: "codex" });

    expect(command()?.textContent).toBe("$lpm-memory ");
    expect(pill()).not.toBeNull();
  });

  it("previews one session from either half of the pill", async () => {
    await render("/lpm-memory auth-refactor continue", SOURCE);
    const hover = (el: HTMLElement) =>
      act(() => {
        el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      });

    hover(pill()!);
    const shown = preview;
    expect(shown?.id).toBe("auth-refactor");
    hover(command()!);
    expect(preview).toBe(shown);
  });

  it("leaves an unknown session as plain text", async () => {
    await render("/lpm-memory qweqweqwe", SOURCE);

    expect(command()?.textContent).toBe("/lpm-memory");
    expect(pill()).toBeNull();
  });

  it("drops the color once the command is edited away", async () => {
    await render("/lpm-memory auth-refactor", SOURCE);
    act(() => {
      editor().replaceChildren(document.createTextNode("lpm-memory auth-refactor"));
      highlight();
    });

    expect(command()).toBeNull();
    expect(pill()).toBeNull();
  });

  it("does nothing without a memory source", async () => {
    await render("/lpm-memory auth-refactor");

    expect(command()).toBeNull();
    expect(readSessions).not.toHaveBeenCalled();
  });
});
