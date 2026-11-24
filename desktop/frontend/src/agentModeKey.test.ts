// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTerminalInput = vi.hoisted(() => vi.fn((_id: string, _data: string) => Promise.resolve()));
const toast = vi.hoisted(() => vi.fn());

vi.mock("../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("./terminal-io", () => ({ sendTerminalInput }));
vi.mock("./notifications/toast", () => ({ toast }));

import { takeAgentModeKey } from "./agentModeKey";
import { useTerminalCommands } from "./store/terminalCommands";

type Target = Partial<Parameters<typeof takeAgentModeKey>[1]>;

function press(target: Target, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: "Tab", keyCode: 9, shiftKey: true, cancelable: true, ...init });
  const stopped = vi.spyOn(e, "stopPropagation");
  const taken = takeAgentModeKey(e, { terminalId: "t1", guest: false, asks: () => false, ...target });
  return { taken, prevented: e.defaultPrevented, stopped: stopped.mock.calls.length > 0 };
}

const TAKEN = { taken: true, prevented: true, stopped: true };
const LEFT_ALONE = { taken: false, prevented: false, stopped: false };
const atPrompt = (t1: boolean) => useTerminalCommands.setState({ atPrompt: { t1 } });

beforeEach(() => {
  vi.clearAllMocks();
  useTerminalCommands.setState({ byId: {}, atPrompt: {} });
});

describe("takeAgentModeKey", () => {
  it("hands Shift+Tab to the agent and keeps the focus where it is", () => {
    expect(press({ agent: "Claude" })).toEqual(TAKEN);
    expect(sendTerminalInput).toHaveBeenCalledWith("t1", "\x1b[Z");
    expect(toast).not.toHaveBeenCalled();
  });

  it("holds the key while the agent asks, when it would pick an answer", () => {
    expect(press({ agent: "Claude", asks: () => true })).toEqual(TAKEN);
    expect(sendTerminalInput).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Answer Claude first, then switch its mode");
  });

  it("leaves Tab, and Shift+Tab with another modifier or in an IME, alone", () => {
    for (const init of [{ shiftKey: false }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
      expect(press({ agent: "Claude" }, init)).toEqual(LEFT_ALONE);
    }
    expect(sendTerminalInput).not.toHaveBeenCalled();
  });

  it("leaves the key alone in a shell, and once the agent has quit to one", () => {
    atPrompt(false);
    expect(press({ agent: null })).toEqual(LEFT_ALONE);
    atPrompt(true);
    expect(press({ agent: "Claude" })).toEqual(LEFT_ALONE);
    expect(sendTerminalInput).not.toHaveBeenCalled();
  });

  it("follows what runs in a terminal whose agent isn't known", () => {
    expect(press({})).toEqual(LEFT_ALONE);
    atPrompt(true);
    expect(press({})).toEqual(LEFT_ALONE);
    atPrompt(false);
    expect(press({})).toEqual(TAKEN);
    expect(sendTerminalInput).toHaveBeenCalledTimes(1);
  });

  it("hands it to a shared tab's agent, whose shell isn't known here", () => {
    expect(press({ guest: true })).toEqual(TAKEN);
    expect(press({ guest: true, asks: () => true })).toEqual(TAKEN);
    expect(sendTerminalInput).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Answer the agent first, then switch its mode");
  });
});
