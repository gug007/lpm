// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askClose, useCloseGuard, type CloseQuestion } from "../closeGuard";
import { CloseGuardHost } from "./CloseGuardHost";

let root: Root;
const behind = vi.fn();

function ask(over: Partial<CloseQuestion> = {}): CloseQuestion {
  const question: CloseQuestion = {
    what: "tab",
    agents: [{ key: "t1", name: "Claude", count: 1, asking: 0 }],
    closeNow: vi.fn(),
    closeWhenDone: vi.fn(),
    ...over,
  };
  act(() => askClose(question));
  return question;
}

function press(init: KeyboardEventInit = {}) {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", metaKey: true, bubbles: true, cancelable: true, ...init }),
    );
  });
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === label)!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  behind.mockClear();
  useCloseGuard.setState({ asking: null });
  root = createRoot(document.createElement("div"));
  act(() => root.render(<CloseGuardHost />));
  window.addEventListener("keydown", behind);
});

afterEach(() => {
  window.removeEventListener("keydown", behind);
  act(() => root.unmount());
});

describe("the close dialog", () => {
  it("names the agents and offers both ways on", () => {
    const q = ask({ agents: [{ key: "t1", name: "Claude", count: 1, asking: 0 }, { key: "t2", name: "Codex", count: 1, asking: 1 }] });
    expect(document.body.textContent).toContain("2 agents are still working");
    expect(document.body.textContent).toContain("Claudeworking");
    expect(document.body.textContent).toContain("Codexwaiting for you");
    act(() => button("Close when done").click());
    expect(q.closeWhenDone).toHaveBeenCalledOnce();
    expect(useCloseGuard.getState().asking).toBeNull();
  });

  it("closes on a second ⌘W, which the next tab never sees", () => {
    const q = ask();
    press();
    expect(q.closeNow).toHaveBeenCalledOnce();
    expect(behind).not.toHaveBeenCalled();
  });

  it("doesn't take a held ⌘W, or ⌃W, for a second press", () => {
    const q = ask();
    press({ repeat: true });
    press({ metaKey: false, ctrlKey: true });
    expect(q.closeNow).not.toHaveBeenCalled();
    expect(useCloseGuard.getState().asking).toBe(q);
  });

  it("leaves ⌘W alone when it wasn't asked about one tab", () => {
    const q = ask({ what: "pane" });
    press();
    expect(q.closeNow).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("again closes it now");
  });

  it("offers to keep open what already waits", () => {
    const keepOpen = vi.fn();
    ask({ keepOpen });
    expect(button("Close when done")).toBeUndefined();
    act(() => button("Keep open").click());
    expect(keepOpen).toHaveBeenCalledOnce();
  });
});
