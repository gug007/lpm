// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClearStatusOnInteraction } from "./useClearStatusOnInteraction";
import type { StatusKind } from "../components/PaneView";

let container: HTMLDivElement;
let root: Root;

function Harness({
  terminalId,
  kinds,
  onClear,
}: {
  terminalId: string | null;
  kinds: StatusKind[];
  onClear: (terminalId: string, kind: StatusKind) => void;
}) {
  useClearStatusOnInteraction(terminalId, kinds, onClear);
  return null;
}

function render(props: {
  terminalId: string | null;
  kinds: StatusKind[];
  onClear: (terminalId: string, kind: StatusKind) => void;
}) {
  act(() => {
    root.render(<Harness {...props} />);
  });
}

function press() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  });
}

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useClearStatusOnInteraction", () => {
  it("keeps the status until the user actually interacts", () => {
    const onClear = vi.fn();
    render({ terminalId: "t1", kinds: ["Done"], onClear });
    expect(onClear).not.toHaveBeenCalled();

    press();
    expect(onClear).toHaveBeenCalledExactlyOnceWith("t1", "Done");
  });

  it("clears every pending kind on one interaction", () => {
    const onClear = vi.fn();
    render({ terminalId: "t1", kinds: ["Done", "Error"], onClear });

    press();
    expect(onClear.mock.calls).toEqual([
      ["t1", "Done"],
      ["t1", "Error"],
    ]);
  });

  it("stays put while the window is not focused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const onClear = vi.fn();
    render({ terminalId: "t1", kinds: ["Done"], onClear });

    press();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("does nothing with no pending status or no terminal", () => {
    const onClear = vi.fn();
    render({ terminalId: "t1", kinds: [], onClear });
    press();
    render({ terminalId: null, kinds: ["Done"], onClear });
    press();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("unsubscribes once the status is gone", () => {
    const onClear = vi.fn();
    render({ terminalId: "t1", kinds: ["Done"], onClear });
    press();
    onClear.mockClear();

    render({ terminalId: "t1", kinds: [], onClear });
    press();
    expect(onClear).not.toHaveBeenCalled();
  });
});
