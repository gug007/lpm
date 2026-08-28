// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarDeckRun } from "./SidebarDeckRun";
import { dealDurationMs } from "./sidebarDeck";

const ROWS = ["a7f2", "k3m9", "p1x4"].map((name) => (
  <button key={name} className="row">
    {name}
  </button>
));

let container: HTMLElement;
let root: Root;

// usePrefersReducedMotion binds its media query at module scope, so the setting
// is swapped at the hook rather than at matchMedia.
const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => motion.reduce,
}));

function render(collapsed: boolean, rows = ROWS) {
  act(() => {
    root.render(
      <SidebarDeckRun runId="deck-glimpse2" collapsed={collapsed}>
        {rows}
      </SidebarDeckRun>,
    );
  });
}

const run = () => container.querySelector("#deck-glimpse2") as HTMLElement;
const dealtRows = () => run().querySelectorAll("button.row");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  motion.reduce = false;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("SidebarDeckRun", () => {
  it("deals its rows out and hides the run when the deck is shut", () => {
    render(false);
    expect(dealtRows()).toHaveLength(3);
    expect(run().hidden).toBe(false);
  });

  it("does not animate rows that were already on screen", () => {
    render(false);
    // A status tick re-renders the sidebar; the rows must not re-deal.
    render(false);
    expect(run().querySelector(".deck-deal-in")).toBeNull();
  });

  it("deals in only once the fold is actually opened", () => {
    render(true);
    render(false);
    expect(run().querySelectorAll(".deck-deal-in")).toHaveLength(3);
  });

  it("gives each row its place in the deal", () => {
    render(true);
    render(false);
    const places = [...run().querySelectorAll<HTMLElement>(".deck-deal-in")].map((el) =>
      el.style.getPropertyValue("--deal-i"),
    );
    expect(places).toEqual(["0", "1", "2"]);
  });

  it("holds the last dealt rows on screen to gather them back, in reverse", () => {
    render(false);
    // The sidebar stops emitting the children the moment the deck shuts.
    render(true, []);
    expect(dealtRows()).toHaveLength(3);
    const places = [...run().querySelectorAll<HTMLElement>(".deck-deal-out")].map((el) =>
      el.style.getPropertyValue("--deal-i"),
    );
    expect(places).toEqual(["2", "1", "0"]);
  });

  it("drops the held rows once the gather has finished", () => {
    render(false);
    render(true, []);
    act(() => {
      vi.advanceTimersByTime(dealDurationMs(3));
    });
    expect(dealtRows()).toHaveLength(0);
    expect(run().hidden).toBe(true);
  });

  it("swaps instantly when the user asked for no motion", () => {
    motion.reduce = true;
    render(false);
    render(true, []);
    expect(dealtRows()).toHaveLength(0);
    expect(run().querySelector(".deck-deal-out")).toBeNull();
  });

  it("lets the deal expire, so a row added later does not slide in on a stale delay", () => {
    render(true);
    render(false);
    expect(run().querySelectorAll(".deck-deal-in")).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(dealDurationMs(3));
    });
    expect(run().querySelector(".deck-deal-in")).toBeNull();
    expect(dealtRows()).toHaveLength(3);
  });

  it("settles the deck when the motion setting changes mid-gather", () => {
    render(false);
    render(true, []);
    expect(dealtRows()).toHaveLength(3);
    // Turning Reduce Motion on cancels the gather's timer; without settling here
    // the held rows would stay on screen under a shut lid for good.
    motion.reduce = true;
    render(true, []);
    expect(dealtRows()).toHaveLength(0);
    expect(run().hidden).toBe(true);
  });

  it("leaves nothing behind under the last row", () => {
    render(false);
    expect(run().nextElementSibling).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });
});
