// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ TerminalUnsentText: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock("../../bridge/commands", () => bridge);
vi.mock("../mirror", () => ({ IS_MIRROR_WINDOW: false }));

import { hasComposerText, noteUnsentElsewhere } from "../store/composerDrafts";
import { useReportUnsentText } from "./useReportUnsentText";

let root: Root;
let report: (unsent: boolean) => void;

function Harness({ id, other, guest }: { id: string; other: boolean; guest: boolean }) {
  report = useReportUnsentText(id, other, guest);
  return null;
}

function show(id: string, other: boolean, guest = false) {
  act(() => root.render(<Harness id={id} other={other} guest={guest} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  bridge.TerminalUnsentText.mockClear();
  root = createRoot(document.createElement("div"));
});

afterEach(() => act(() => root.unmount()));

describe("useReportUnsentText", () => {
  it("tells the computer a terminal runs on, once per change", () => {
    show("peer-a-api-1", true);
    report(false);
    report(true);
    report(true);
    expect(bridge.TerminalUnsentText.mock.calls).toEqual([["peer-a-api-1", expect.any(String), true]]);
    report(false);
    expect(bridge.TerminalUnsentText).toHaveBeenLastCalledWith("peer-a-api-1", expect.any(String), false);
  });

  it("remembers what it said when the composer comes back empty", () => {
    show("peer-a-api-2", true);
    report(true);
    show("peer-a-api-3", true);
    show("peer-a-api-2", true);
    report(false);
    expect(bridge.TerminalUnsentText).toHaveBeenLastCalledWith("peer-a-api-2", expect.any(String), false);
  });

  it("takes over from a detached window in the window that holds the tab, and says nothing", () => {
    noteUnsentElsewhere("api-4", "window", true);
    expect(hasComposerText("api-4")).toBe(true);
    show("api-4", false);
    report(true);
    expect(hasComposerText("api-4")).toBe(false);
    expect(bridge.TerminalUnsentText).not.toHaveBeenCalled();
  });

  it("speaks for no one in a shared tab", () => {
    show("peer-a-api-5", true, true);
    report(true);
    expect(bridge.TerminalUnsentText).not.toHaveBeenCalled();
  });
});
