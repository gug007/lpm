// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limits = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../bridge/commands", () => ({}));
vi.mock("../hooks/useAgentLimits", () => ({
  useAgentLimits: () => ({ limits: limits.current, loading: false, error: "", refresh: () => {} }),
}));

import { useAccountsStore } from "../store/accounts";
import { ClaudeAccountSubmenu } from "./ClaudeAccountSubmenu";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useAccountsStore.setState({
    accounts: [
      { id: "work", label: "Work" },
      { id: "side", label: "Side" },
    ],
    statuses: {
      work: { signedIn: true, email: "" },
      side: { signedIn: false, email: "" },
    },
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function open(props: Partial<Parameters<typeof ClaudeAccountSubmenu>[0]> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  act(() =>
    root.render(
      <ClaudeAccountSubmenu
        isCopy={false}
        onPick={onPick}
        onManage={() => {}}
        onClose={onClose}
        {...props}
      />,
    ),
  );
  const trigger = [...host.querySelectorAll("button")].find((b) => b.textContent === "Claude account");
  act(() => {
    trigger!.parentElement!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    trigger!.click();
  });
  return { onPick, onClose };
}

function row(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((b) =>
    b.querySelector("span.truncate")?.textContent === label,
  );
  if (!match) throw new Error(`no row ${label}`);
  return match;
}

const checked = (label: string) => row(label).querySelector("polyline") !== null;

describe("ClaudeAccountSubmenu", () => {
  it("renders nothing until an account exists", () => {
    useAccountsStore.setState({ accounts: [] });
    act(() =>
      root.render(
        <ClaudeAccountSubmenu isCopy={false} onPick={() => {}} onManage={() => {}} onClose={() => {}} />,
      ),
    );
    expect(host.textContent).toBe("");
  });

  it("checks the main login when a project has no pin", () => {
    open();
    expect(checked("Main login")).toBe(true);
    expect(checked("Work")).toBe(false);
    expect(host.textContent).not.toContain("Same as parent");
  });

  it("checks the pinned account and flags one that is signed out", () => {
    open({ pinned: "side" });
    expect(checked("Side")).toBe(true);
    expect(checked("Main login")).toBe(false);
    expect(row("Side").textContent).toContain("Not signed in");
  });

  it("lets a copy follow its parent", () => {
    const { onPick, onClose } = open({ isCopy: true });
    expect(checked("Same as parent")).toBe(true);
    expect(checked("Main login")).toBe(false);
    act(() => row("Same as parent").click());
    expect(onPick).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows each account's 5-hour and weekly usage", () => {
    const now = Math.floor(Date.now() / 1000);
    limits.current = {
      "claude:work": {
        provider: "claude",
        accountId: "work",
        fiveHour: { usedPercent: 41, resetsAt: now + 3 * 3600 },
        weekly: { usedPercent: 96, resetsAt: now + 2 * 86400 },
        updatedAt: Date.now(),
      },
    };
    open();
    const text = row("Work").textContent ?? "";
    expect(text).toContain("5h");
    expect(text).toContain("41%");
    expect(text).toContain("7d");
    expect(text).toContain("96%");
    expect(row("Main login").textContent).toContain("—");
    limits.current = {};
  });

  it("picks an account by id", () => {
    const { onPick } = open();
    act(() => row("Work").click());
    expect(onPick).toHaveBeenCalledWith("work");
  });
});
