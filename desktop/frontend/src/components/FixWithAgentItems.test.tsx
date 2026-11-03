// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/app";
import type { ActionInfo, ProjectInfo } from "../types";
import { FixWithAgentItems } from "./FixWithAgentItems";

vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));

const action = (name: string, cmd: string, extra: Partial<ActionInfo> = {}): ActionInfo =>
  ({ name, label: name.split(":").pop(), cmd, confirm: false, display: "header", type: "terminal", ...extra }) as ActionInfo;

const claudeMax = action("claude-max", "", {
  label: "Claude Max",
  primary: "last-used",
  children: [action("claude-max:claude", "claude"), action("claude-max:ultracode", "claude --model opus")],
});
const codex = action("codex", "codex", { label: "Codex" });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useAppStore.setState({ projects: [] });
});

function render(actions: ActionInfo[]) {
  useAppStore.setState({ projects: [{ name: "web", actions } as ProjectInfo] });
  const onFix = vi.fn();
  act(() => root.render(<FixWithAgentItems projectName="web" onFix={onFix} />));
  return onFix;
}

const row = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text));
const labels = () => [...host.querySelectorAll("button")].map((b) => b.querySelector("span.truncate")?.textContent);

describe("FixWithAgentItems", () => {
  it("offers each agent action, a split as one row that runs its lead", () => {
    const onFix = render([claudeMax, codex]);
    expect(labels()).toEqual(["Fix with claude", "Fix with Codex"]);
    act(() => row("Fix with claude")!.click());
    expect(onFix.mock.calls[0][0].id).toBe("claude-max:claude");
  });

  it("lists a split's items in its submenu", () => {
    const onFix = render([claudeMax, codex]);
    act(() => row("Fix with claude")!.parentElement!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(labels()).toContain("ultracode");
    act(() => row("ultracode")!.click());
    expect(onFix.mock.calls[0][0]).toMatchObject({ id: "claude-max:ultracode", group: claudeMax });
  });

  it("says what a lone agent does", () => {
    render([codex]);
    expect(row("Fix with Codex")!.textContent).toContain("Opens a new tab with the failing checks");
  });
});
