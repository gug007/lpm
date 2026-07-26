// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/runtime", () =>
  new Proxy({}, { has: () => true, get: (_t, prop) => (prop === "then" ? undefined : vi.fn()) }));

import { useControlRevealResync } from "./useControlRevealResync";
import { applyControlOwner, onControlChange, useIsControlled } from "../../store/terminalControl";

const TID = "proj-1";
const PHONE = { kind: "mobile", id: "iphone", label: "iPhone" };
const MAIN = { kind: "window", id: "main", label: "Main window" };

// Stands in for InteractiveTab + InteractivePane: the pane is display:none behind
// the placeholder until this surface owns the terminal, and the resync measures
// the host. `seen` records what the pane's visibility WAS at each resync, which
// is what the PTY-geometry fix depends on.
function Tab({ seen, visible = true }: { seen: string[]; visible?: boolean }) {
  const controlled = useIsControlled(TID);
  useControlRevealResync(TID, visible, () => {
    seen.push(document.getElementById("pane")!.dataset.shown!);
  });
  return (
    <div id="pane" data-shown={controlled ? "shown" : "hidden"}>
      terminal
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  applyControlOwner(TID, null);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(seen: string[], visible = true) {
  act(() => {
    root.render(<Tab seen={seen} visible={visible} />);
  });
}

describe("useControlRevealResync", () => {
  it("resyncs after the reveal when control comes back to this surface", () => {
    const seen: string[] = [];
    render(seen);
    seen.length = 0;

    act(() => applyControlOwner(TID, PHONE));
    expect(seen).toEqual([]); // not ours: nothing to drive

    act(() => applyControlOwner(TID, MAIN));
    // The regression this guards: a resync that ran with the pane still hidden
    // measures nothing, so the PTY keeps the phone's columns.
    expect(seen).toEqual(["shown"]);
  });

  it("is what the imperative control listener cannot do", () => {
    const seenByListener: string[] = [];
    const off = onControlChange(() => {
      seenByListener.push(document.getElementById("pane")!.dataset.shown!);
    });
    render([]);

    act(() => applyControlOwner(TID, PHONE));
    act(() => applyControlOwner(TID, MAIN));
    off();

    // Listeners fire inside applyControlOwner, before React commits the reveal.
    expect(seenByListener).toEqual(["shown", "hidden"]);
  });

  it("skips a background tab, which has no layout to measure either", () => {
    const seen: string[] = [];
    render(seen, false);
    act(() => applyControlOwner(TID, PHONE));
    act(() => applyControlOwner(TID, MAIN));
    expect(seen).toEqual([]);
  });

  // An owner change with no reveal (nobody owned it, or only the label moved)
  // needs no post-commit measure — the imperative listener already handled it.
  it("does not re-resync while this surface stays visible throughout", () => {
    const seen: string[] = [];
    render(seen);
    seen.length = 0;
    act(() => applyControlOwner(TID, MAIN));
    act(() => applyControlOwner(TID, { ...MAIN, label: "Main window (renamed)" }));
    expect(seen).toEqual([]);
  });
});
