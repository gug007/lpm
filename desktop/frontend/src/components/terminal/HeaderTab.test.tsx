// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeaderTab } from "./HeaderTab";
import type { PaneAgentStatus } from "../../hooks/usePaneStatus";

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

const NOW = Date.now();
const working: PaneAgentStatus = { state: "working", since: NOW - 240_000 };
const paused: PaneAgentStatus = { ...working, pause: { since: NOW - 60_000, shells: ["Run the test suite"], key: "claude_code_a" } };

function render(agentStatus: PaneAgentStatus, flags: { waiting?: boolean } = {}) {
  act(() =>
    root.render(
      <HeaderTab label="Permissions" active onClick={() => {}} shimmer agentStatus={agentStatus} {...flags} />,
    ),
  );
  return container.querySelector("button")!;
}

describe("HeaderTab", () => {
  it("shimmers while its agent works", () => {
    const tab = render(working);
    expect(tab.querySelector(".sidebar-shimmer")).not.toBeNull();
    expect(tab.querySelector("[data-agent-shells]")).toBeNull();
  });

  it("holds still and names the shells while its agent is paused", () => {
    const tab = render(paused);
    expect(tab.querySelector(".sidebar-shimmer")).toBeNull();
    expect(tab.textContent).toBe("Permissions1 shell");
    expect(tab.querySelector("[data-agent-shells]")?.querySelector("svg")).toBeNull();
  });

  it("lets a question on the tab speak over the pause", () => {
    const tab = render(paused, { waiting: true });
    expect(tab.querySelector(".sidebar-waiting")).not.toBeNull();
    expect(tab.querySelector("[data-agent-shells]")).toBeNull();
  });
});
