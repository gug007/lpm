// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limits = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../bridge/commands", () => ({}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
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
  const onChooseList = vi.fn();
  act(() =>
    root.render(
      <ClaudeAccountSubmenu
        isCopy={false}
        onPick={onPick}
        onChooseList={onChooseList}
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
  return { onPick, onClose, onChooseList };
}

function row(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((b) =>
    b.querySelector("span.truncate")?.textContent === label,
  );
  if (!match) throw new Error(`no row ${label}`);
  return match;
}

const checked = (label: string) =>
  row(label).querySelector('polyline[points="20 6 9 17 4 12"]') !== null;

describe("ClaudeAccountSubmenu", () => {
  it("renders nothing until an account exists", () => {
    useAccountsStore.setState({ accounts: [] });
    act(() =>
      root.render(
        <ClaudeAccountSubmenu
          isCopy={false}
          onPick={() => {}}
          onChooseList={() => {}}
          onManage={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(host.textContent).toBe("");
  });

  it("checks the main accounts when a project sets neither key", () => {
    open();
    expect(checked("Main accounts")).toBe(true);
    expect(checked("Main login only")).toBe(false);
    expect(checked("Work")).toBe(false);
    expect(host.textContent).not.toContain("Same as parent");
  });

  it("checks the pinned account and flags one that is signed out", () => {
    open({ own: { claudeAccount: "side" } });
    expect(checked("Side")).toBe(true);
    expect(checked("Main accounts")).toBe(false);
    expect(row("Side").textContent).toContain("Not signed in");
  });

  it("checks the main login when it is pinned", () => {
    const { onPick } = open({ own: { claudeAccount: "" } });
    expect(checked("Main login only")).toBe(true);
    expect(checked("Main accounts")).toBe(false);
    act(() => row("Main accounts").click());
    expect(onPick).toHaveBeenCalledWith({ kind: "main" });
  });

  it("lets a copy follow its parent", () => {
    const { onPick, onClose } = open({ isCopy: true, parent: { claudeAccount: "work" } });
    expect(checked("Same as parent")).toBe(true);
    expect(checked("Main accounts")).toBe(false);
    expect(row("Same as parent").textContent).toContain("Work");
    act(() => row("Same as parent").click());
    expect(onPick).toHaveBeenCalledWith({ kind: "parent" });
    expect(onClose).toHaveBeenCalled();
  });

  it("checks the main accounts on a copy that left its parent's choice", () => {
    open({ isCopy: true, own: { claudeAccounts: [] } });
    expect(checked("Main accounts")).toBe(true);
    expect(checked("Same as parent")).toBe(false);
  });

  it("checks and opens the project's own list", () => {
    const { onChooseList } = open({ own: { claudeAccounts: ["work", "default"] } });
    expect(checked("Choose accounts…")).toBe(true);
    expect(row("Choose accounts…").textContent).toContain("Work, Main login");
    act(() => row("Choose accounts…").click());
    expect(onChooseList).toHaveBeenCalled();
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
    expect(row("Main login only").textContent).toContain("—");
    limits.current = {};
  });

  it("picks an account by id", () => {
    const { onPick } = open();
    act(() => row("Work").click());
    expect(onPick).toHaveBeenCalledWith({ kind: "pin", id: "work" });
  });
});
