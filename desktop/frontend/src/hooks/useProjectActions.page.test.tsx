// @vitest-environment happy-dom
import { act, createRef, useImperativeHandle, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo } from "../types";

const runAction = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("../../bridge/commands", () => ({ CheckActionPortConflict: vi.fn(), RunAction: runAction }));
vi.mock("../../bridge/runtime", () => ({ EventsOnReady: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("../notifications/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("../store/app", () => ({ useAppStore: { getState: () => ({}) } }));
vi.mock("./backgroundActionRun", () => ({ runBackgroundAction: vi.fn() }));

import type { TerminalViewHandle } from "../components/TerminalView";
import type { PageRunResult } from "../popup/pageRun";
import { useProjectActions, type UseProjectActionsResult } from "./useProjectActions";

const input = (key: string, options?: string[]) => ({
  key,
  label: key,
  type: options ? "select" : "text",
  required: true,
  placeholder: "",
  default: "",
  persist: false,
  options: options?.map((value) => ({ label: value, value })),
});

const deploy = {
  name: "deploy",
  label: "Deploy",
  cmd: "./deploy.sh {{env}}",
  type: "terminal",
  inputs: [input("env", ["staging", "prod"])],
} as ActionInfo;

let container: HTMLDivElement;
let root: Root;
const createTerminalWithCmd = vi.fn(() => Promise.resolve());
const terminalViewRef = { current: { createTerminalWithCmd } as unknown as TerminalViewHandle };

function Harness({ hold }: { hold: Ref<UseProjectActionsResult> }) {
  const result = useProjectActions({ projectName: "web", terminalViewRef, onSwitchToTerminal: () => {} });
  useImperativeHandle(hold, () => result);
  return null;
}

async function mount() {
  const hold = createRef<UseProjectActionsResult>();
  await act(async () => root.render(<Harness hold={hold} />));
  return () => hold.current!;
}

async function runFromPage(hook: () => UseProjectActionsResult, action: ActionInfo, given: Record<string, string>) {
  const heard: PageRunResult[] = [];
  await act(async () => hook().handleRunAction(action, { given, onDone: (r) => heard.push(r) }));
  return heard;
}

beforeEach(() => {
  createTerminalWithCmd.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a page's run", () => {
  it("skips the form when the page filled every input, and hears it start", async () => {
    const hook = await mount();
    const heard = await runFromPage(hook, deploy, { env: "prod" });
    expect(hook().modals.inputs.action).toBeNull();
    expect(createTerminalWithCmd).toHaveBeenCalledWith("Deploy", "./deploy.sh prod", expect.anything());
    expect(heard).toEqual([{ ok: true }]);
  });

  it("asks for what the page left out, starting from what it gave", async () => {
    const hook = await mount();
    const two = { ...deploy, inputs: [...deploy.inputs!, input("tag")] } as ActionInfo;
    await runFromPage(hook, two, { env: "prod" });
    expect(hook().modals.inputs.action).toBe(two);
    expect(hook().modals.inputs.initial).toEqual({ env: "prod" });
  });

  it("hears a cancel, and a newer run takes the place of one asking", async () => {
    const hook = await mount();
    const first = await runFromPage(hook, deploy, { env: "qa" });
    const second = await runFromPage(hook, { ...deploy, confirm: true } as ActionInfo, { env: "prod" });
    expect(first).toEqual([{ ok: false, canceled: true }]);
    expect(hook().modals.inputs.action).toBeNull();
    expect(hook().modals.confirm.action?.name).toBe("deploy");
    await act(async () => hook().modals.confirm.onCancel());
    expect(second).toEqual([{ ok: false, canceled: true }]);
    expect(createTerminalWithCmd).not.toHaveBeenCalled();
  });

  it("runs once confirmed, with the page's values", async () => {
    const hook = await mount();
    const heard = await runFromPage(hook, { ...deploy, confirm: true } as ActionInfo, { env: "staging" });
    await act(async () => hook().modals.confirm.onConfirm());
    expect(createTerminalWithCmd).toHaveBeenCalledWith("Deploy", "./deploy.sh staging", expect.anything());
    expect(heard).toEqual([{ ok: true }]);
  });
});
