// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    selected: "lpm" as string | null,
    projects: [{ name: "lpm", isRemote: false }] as unknown[],
  },
  inUse: { current: "work", standby: [] as string[] } as { current: string; standby: string[] } | null,
  setClaudeAccountChoice: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks.app),
}));
vi.mock("../hooks/useAgentLimits", () => ({
  useAgentLimits: () => ({ limits: {}, loading: false, error: "", refresh: () => {} }),
}));
vi.mock("../hooks/useProjectClaudeAccounts", () => ({
  useProjectClaudeAccounts: (name: string | null) => (name ? mocks.inUse : null),
}));
vi.mock("../store/claudeAccountPin", () => ({
  setClaudeAccountChoice: mocks.setClaudeAccountChoice,
  openClaudeAccountSettings: vi.fn(),
}));

import { SidebarUsageAccountMenu } from "./SidebarUsageAccountMenu";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.app.selected = "lpm";
  mocks.app.projects = [{ name: "lpm", isRemote: false }];
  mocks.inUse = { current: "work", standby: [] };
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function open(account = "side", label = "Side") {
  const onClose = vi.fn();
  act(() =>
    root.render(
      <SidebarUsageAccountMenu account={account} label={label} x={0} y={0} onOpenUsage={() => {}} onClose={onClose} />,
    ),
  );
  const item = [...host.querySelectorAll("button")].find(
    (b) => b.querySelector("span.truncate")?.textContent === `Switch to ${label}`,
  );
  if (!item) throw new Error(`no switch item for ${label}`);
  return { item, onClose, checked: item.querySelector('polyline[points="20 6 9 17 4 12"]') !== null };
}

describe("SidebarUsageAccountMenu", () => {
  it("switches the selected project to the account", () => {
    const { item, onClose } = open();
    expect(item.textContent).toContain("New sessions in lpm");
    act(() => item.click());
    expect(mocks.setClaudeAccountChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "side" });
    expect(onClose).toHaveBeenCalled();
  });

  it("pins the main login by its empty id", () => {
    const { item } = open("default", "Claude");
    act(() => item.click());
    expect(mocks.setClaudeAccountChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "" });
  });

  it("can't switch a project to the account it is already pinned to", () => {
    mocks.app.projects = [{ name: "lpm", isRemote: false, claudeAccount: "side" }];
    mocks.inUse = { current: "side", standby: [] };
    const { item, checked } = open();
    expect(checked).toBe(true);
    expect(item.disabled).toBe(true);
  });

  it("can pin a project that is only rotating onto the account", () => {
    mocks.inUse = { current: "side", standby: ["work"] };
    const { item, checked } = open();
    expect(checked).toBe(true);
    expect(item.disabled).toBe(false);
  });

  it("does nothing without a local project", () => {
    mocks.app.projects = [{ name: "lpm", isRemote: true }];
    const { item } = open();
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain("Select a local project first");
  });
});
