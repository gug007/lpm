// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = vi.hoisted(() => {
  const now = new Date(2026, 8, 27, 20, 0, 0).getTime();
  vi.useFakeTimers({ now });
  return now;
});

import { TabTooltipCard, tabCardHasDetails } from "./TabTooltipCard";
import { clockLabel } from "../../sendLater/time";
import type { PaneAgentStatus } from "../../hooks/usePaneStatus";

const ago = (secs: number) => NOW - secs * 1000;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(agentStatus: PaneAgentStatus | null, origin?: string) {
  act(() =>
    root.render(
      <TabTooltipCard label="LPM desktop improvements" origin={origin} color="orange" agentStatus={agentStatus} />,
    ),
  );
  return container.textContent ?? "";
}

describe("TabTooltipCard", () => {
  it("leaves the state word out while working and keeps the running time", () => {
    const text = render({ state: "working", since: ago(79) }, "Ultracode");
    expect(text).not.toContain("Status");
    expect(text).not.toContain("Working");
    expect(text).toContain(`For1m 19s· since ${clockLabel(ago(79))}`);
    expect(text).toContain("ActionUltracode");
  });

  it("names the state when the agent needs you", () => {
    const text = render({ state: "needs-you", since: ago(12) });
    expect(text).toContain("StatusNeeds you");
    expect(text).toContain("For12s");
    expect(text).not.toContain("Action");
  });

  it("holds a finished turn still, with when it ended", () => {
    const text = render({ state: "done", since: ago(302), until: ago(60) });
    expect(text).toContain("StatusDone");
    expect(text).toContain(`Took4m 2s· ended ${clockLabel(ago(60))}`);
  });

  it("drops the time row when the start was never seen", () => {
    const text = render({ state: "error", since: null }, "Ultracode");
    expect(text).toContain("StatusProblem");
    expect(text).not.toContain("For");
  });
});

describe("tabCardHasDetails", () => {
  it("needs something beyond the title", () => {
    expect(tabCardHasDetails(null, undefined)).toBe(false);
    expect(tabCardHasDetails({ state: "working", since: null }, undefined)).toBe(false);
    expect(tabCardHasDetails({ state: "working", since: ago(5) }, undefined)).toBe(true);
    expect(tabCardHasDetails({ state: "needs-you", since: null }, undefined)).toBe(true);
    expect(tabCardHasDetails(null, "Ultracode")).toBe(true);
  });
});
