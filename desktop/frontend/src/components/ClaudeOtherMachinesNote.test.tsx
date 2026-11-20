// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSettingsMachine: vi.fn(),
  claude: { aliases: {} as Record<string, string>, machines: {} as Record<string, unknown> },
}));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({ setSettingsMachine: mocks.setSettingsMachine }),
}));
vi.mock("../store/machineClaude", () => ({
  useMachineClaudeStore: (select: (state: unknown) => unknown) => select(mocks.claude),
}));

import { ClaudeOtherMachinesNote } from "./ClaudeOtherMachinesNote";

let host: HTMLDivElement;
let root: Root;

const shared = {};
const buttons = () => [...host.querySelectorAll("button")];

function show() {
  act(() => root.render(<ClaudeOtherMachinesNote />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
  mocks.claude = { aliases: {}, machines: {} };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the note under this machine's Claude accounts", () => {
  it("stays away while no other computer is connected", () => {
    show();
    expect(host.textContent).toBe("");
  });

  it("leaves out a computer too old to share its accounts", () => {
    mocks.claude = { aliases: { aaaa1111: "old-mini" }, machines: {} };
    show();
    expect(host.textContent).toBe("");
  });

  it("says a connected computer's sessions use its own accounts and opens them", () => {
    mocks.claude = { aliases: { aaaa1111: "taucloud" }, machines: { aaaa1111: shared } };
    show();
    expect(host.textContent).toContain("These accounts are for sessions on this Mac.");
    expect(host.textContent).toContain("Sessions on taucloud use the accounts on taucloud.");
    expect(buttons().map((b) => b.textContent)).toEqual(["Accounts on taucloud"]);
    act(() => buttons()[0].click());
    expect(mocks.setSettingsMachine).toHaveBeenCalledWith("aaaa1111");
  });

  it("offers each computer when several are connected", () => {
    mocks.claude = {
      aliases: { aaaa1111: "taucloud", bbbb2222: "mini" },
      machines: { aaaa1111: shared, bbbb2222: shared },
    };
    show();
    expect(host.textContent).toContain("Each connected computer uses its own accounts.");
    expect(buttons().map((b) => b.textContent)).toEqual(["taucloud", "mini"]);
    act(() => buttons()[1].click());
    expect(mocks.setSettingsMachine).toHaveBeenCalledWith("bbbb2222");
  });
});
