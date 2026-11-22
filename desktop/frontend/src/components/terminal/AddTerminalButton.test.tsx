// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../../store/settings";
import type { ActionInfo } from "../../types";

vi.mock("../../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  OnFileDrop: vi.fn(),
  OnFileDropOff: vi.fn(),
}));

import { AddTerminalButton } from "./AddTerminalButton";

let host: HTMLDivElement;
let root: Root;
const update = useSettingsStore.getState().update;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  useSettingsStore.setState({ pickAgentOnNewTab: false, update });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<Parameters<typeof AddTerminalButton>[0]> = {}) {
  const handlers = {
    onAddTerminal: vi.fn(),
    onRunCommand: vi.fn(),
    onOpenAgent: vi.fn(),
    onRunAction: vi.fn(),
    onResumeSession: vi.fn(),
    onOpenRequestHandled: vi.fn(),
  };
  const project = { name: "wt-one", label: "wt-one", root: "/tmp/wt-one", actions: [] };
  act(() =>
    root.render(<AddTerminalButton project={project} openRequested={false} {...handlers} {...props} />),
  );
  return handlers;
}

const plus = () => host.querySelector<HTMLButtonElement>('button[aria-label="New terminal"]')!;
const popup = () => document.querySelector('[role="dialog"][aria-label="New tab"]');
const prompt = () => popup()!.querySelector<HTMLElement>('[role="textbox"]')!;
const tabs = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Start in"] [role="radio"]')];
const tab = (name: string) => tabs().find((t) => t.textContent?.endsWith(name))!;
const button = (label: string) =>
  [...popup()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim().startsWith(label))!;
const modelMenu = (agent: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label^="${agent} model and level"]`)!;
const pill = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Model"] button')].find(
    (b) => b.textContent === label,
  )!;

function rightClick(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
}

function mouseDown(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
}

function typeInto(el: HTMLElement, text: string) {
  act(() => {
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("AddTerminalButton", () => {
  it("opens a terminal on a click", () => {
    const h = render();
    act(() => plus().click());
    expect(h.onAddTerminal).toHaveBeenCalledTimes(1);
    expect(popup()).toBeNull();
  });

  it("shows the empty project's box on right-click, the prompt taking the keyboard", () => {
    render();
    rightClick(plus());
    expect(popup()).not.toBeNull();
    expect(tabs().map((t) => t.textContent)).toEqual(["Terminal", "Claude", "Codex", "Gemini", "OpenCode"]);
    expect(document.activeElement).toBe(prompt());
    expect(button("Open Terminal")).toBeTruthy();
    expect(popup()!.querySelector('[aria-label="Message history"]')).not.toBeNull();
  });

  it("runs what was typed in a new terminal", () => {
    const h = render();
    rightClick(plus());
    typeInto(prompt(), "npm test");
    expect(button("Run")).toBeTruthy();
    press(prompt(), "Enter");
    expect(h.onRunCommand).toHaveBeenCalledWith("npm test", undefined);
    expect(popup()).toBeNull();
  });

  it("starts the picked agent with what was typed, and starts there next time", () => {
    const h = render();
    rightClick(plus());
    act(() => tab("Codex").click());
    typeInto(prompt(), "fix the flaky test");
    press(prompt(), "Enter");
    expect(h.onOpenAgent).toHaveBeenCalledWith({ agent: "codex", model: "", effort: "", prompt: "fix the flaky test" });
    expect(popup()).toBeNull();

    rightClick(plus());
    expect(button("Start Codex")).toBeTruthy();
  });

  it("stays open while a model is picked from its menu, and closes on a press outside", () => {
    const h = render();
    rightClick(plus());
    act(() => tab("Codex").click());
    act(() => modelMenu("Codex").click());
    mouseDown(pill("GPT-6.1 Sol"));
    act(() => pill("GPT-6.1 Sol").click());
    expect(popup()).not.toBeNull();

    act(() => button("Start Codex").click());
    expect(h.onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ agent: "codex", model: "gpt-6.1-sol" }));

    rightClick(plus());
    mouseDown(document.body);
    expect(popup()).toBeNull();
  });

  it("closes an open menu on Escape before closing", () => {
    render();
    rightClick(plus());
    act(() => tab("Codex").click());
    act(() => modelMenu("Codex").click());
    expect(document.querySelector('[aria-label="Model"]')).not.toBeNull();

    press(prompt(), "Escape");
    expect(document.querySelector('[aria-label="Model"]')).toBeNull();
    expect(popup()).not.toBeNull();

    press(prompt(), "Escape");
    expect(popup()).toBeNull();
  });

  it("offers the project's agent actions and runs one in this pane's popup", () => {
    const codex = { name: "codex", label: "Codex", cmd: "codex", confirm: false, display: "header", type: "terminal" } as ActionInfo;
    const h = render({ project: { name: "wt-one", label: "wt-one", root: "/tmp/wt-one", actions: [codex] } });
    rightClick(plus());
    expect(tabs().map((t) => t.textContent)).toEqual(["Terminal", "Codex"]);
    act(() => tab("Codex").click());
    act(() => button("Start Codex").click());
    expect(h.onRunAction).toHaveBeenCalledWith(codex, { prompt: undefined });
    expect(h.onOpenAgent).not.toHaveBeenCalled();
  });

  it("asks what to open on a click once + opens the menu", () => {
    useSettingsStore.setState({ pickAgentOnNewTab: true });
    const h = render();
    act(() => plus().click());
    expect(popup()).not.toBeNull();
    expect(h.onAddTerminal).not.toHaveBeenCalled();

    act(() => button("Open Terminal").click());
    expect(h.onAddTerminal).toHaveBeenCalledTimes(1);
    expect(popup()).toBeNull();
  });

  it("sets what + opens from the footer", () => {
    const setSettings = vi.fn(async () => {});
    useSettingsStore.setState({ update: setSettings });
    render();
    rightClick(plus());
    const footer = document.querySelector('[aria-label="Clicking + opens"]')!;
    act(() =>
      Array.from(footer.querySelectorAll("button"))
        .find((b) => b.textContent === "Menu")!
        .click(),
    );
    expect(setSettings).toHaveBeenCalledWith({ pickAgentOnNewTab: true });
  });

  it("opens when ⌘T asks, and says so", () => {
    const h = render({ openRequested: true });
    expect(popup()).not.toBeNull();
    expect(h.onOpenRequestHandled).toHaveBeenCalledTimes(1);
  });

  it("hands Resume a past session on and closes", () => {
    const h = render();
    rightClick(plus());
    act(() => button("Resume a past session").click());
    expect(h.onResumeSession).toHaveBeenCalledTimes(1);
    expect(popup()).toBeNull();
  });
});
