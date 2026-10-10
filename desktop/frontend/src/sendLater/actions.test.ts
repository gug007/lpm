import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendNow: vi.fn(),
  toast: vi.fn(),
  focusProjectTerminal: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({ SendLaterSendNow: mocks.sendNow }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("sonner", () => ({ toast: Object.assign(mocks.toast, { error: vi.fn() }) }));
vi.mock("../store/app", () => ({
  useAppStore: { getState: () => ({ focusProjectTerminal: mocks.focusProjectTerminal }) },
}));

import { sendScheduledNow } from "./actions";
import { setHold, type ScheduledPrompt } from "../store/sendLater";
import { useTerminalTargets } from "../store/terminalTargets";

const item: ScheduledPrompt = {
  id: "p1",
  projectName: "api",
  historyKey: "hk-1",
  terminalLabel: "Terminal 1",
  agent: "claude",
  text: "next step",
  images: {},
  dueAt: 0,
  createdAt: 0,
  state: "due",
  kind: "time",
  force: false,
};

beforeEach(() => {
  mocks.sendNow.mockReset().mockResolvedValue(undefined);
  mocks.toast.mockReset();
  mocks.focusProjectTerminal.mockReset();
  setHold(item.id, null);
  useTerminalTargets.getState().setProjectTargets("api", [
    { id: "pty-7", label: "Terminal 1", emoji: "", historyKey: "hk-1" },
  ]);
});

describe("sendScheduledNow", () => {
  it("sends a prompt held behind a busy agent without a word", () => {
    setHold(item.id, "busy");
    sendScheduledNow(item);
    expect(mocks.sendNow).toHaveBeenCalledWith("p1");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("shows the question a prompt is held behind instead of answering it", () => {
    setHold(item.id, "asking");
    sendScheduledNow(item);
    expect(mocks.sendNow).toHaveBeenCalledWith("p1");
    expect(mocks.toast).toHaveBeenCalledWith(
      "Terminal 1 is waiting for your answer",
      expect.objectContaining({ description: expect.stringContaining("right after") }),
    );
    expect(mocks.focusProjectTerminal).toHaveBeenCalledWith("api", "pty-7");
  });
});
