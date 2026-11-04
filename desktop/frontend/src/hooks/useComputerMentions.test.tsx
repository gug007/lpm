// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MentionComputer } from "../computerMentions";

const mocks = vi.hoisted(() => ({
  computers: vi.fn(),
  listeners: new Map<string, () => void>(),
}));

vi.mock("../../bridge/commands", () => ({ AgentMentionComputers: mocks.computers }));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: () => void) => {
    mocks.listeners.set(name, cb);
    return () => mocks.listeners.delete(name);
  },
}));

import { useComputerMentions } from "./useComputerMentions";

const computer = (access: string): MentionComputer => ({
  name: "Mac mini",
  slug: "c2a0e3b1",
  access,
  places: [{ label: "Home folder", path: "Mac mini:~", insert: "Mac mini:~ (on another computer)" }],
});

let shown: string[] = [];

function Harness() {
  shown = useComputerMentions(true).groups.map((g) => g.detail ?? "");
  return null;
}

let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  mocks.listeners.clear();
  vi.clearAllMocks();
});

describe("useComputerMentions", () => {
  it("reads again when a connection changes while a read is out", async () => {
    const answers: Array<(list: MentionComputer[]) => void> = [];
    mocks.computers.mockImplementation(
      () => new Promise<MentionComputer[]>((resolve) => answers.push(resolve)),
    );
    await act(async () => root.render(<Harness />));
    expect(mocks.computers).toHaveBeenCalledTimes(1);

    act(() => mocks.listeners.get("peer-state-changed")?.());
    act(() => mocks.listeners.get("peer-state-changed")?.());
    expect(mocks.computers).toHaveBeenCalledTimes(1);

    await act(async () => answers[0]([computer("off · turn on in Connections")]));
    expect(mocks.computers).toHaveBeenCalledTimes(2);

    await act(async () => answers[1]([computer("commands")]));
    expect(mocks.computers).toHaveBeenCalledTimes(2);
    expect(shown).toEqual(["commands ›"]);
  });
});
