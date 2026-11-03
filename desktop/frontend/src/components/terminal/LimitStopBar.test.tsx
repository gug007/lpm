// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LimitStop } from "../../claudeLimitStop";

const bridge = vi.hoisted(() => ({
  ClaudeLimitStop: vi.fn(async (): Promise<LimitStop | null> => null),
  DismissClaudeLimitStop: vi.fn(async () => {}),
}));
const events = vi.hoisted(() => ({ listeners: new Map<string, (payload: unknown) => void>() }));
const settings = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    events.listeners.set(name, cb);
    return () => events.listeners.delete(name);
  },
}));
vi.mock("../../store/claudeAccountPin", () => ({ openClaudeAccountSettings: settings.open }));
vi.mock("./TabClaudeAccountList", () => ({
  TabClaudeAccountList: ({ onPick }: { onPick: (account: string, label: string) => void }) => (
    <button type="button" onClick={() => onPick("acct-3", "Claude 3")}>
      Claude 3
    </button>
  ),
}));

import { LimitStopBar } from "./LimitStopBar";

const soon = () => Math.floor(Date.now() / 1000) + 62 * 3600;
const weekly = (): LimitStop => ({
  kind: "limit",
  account: "default",
  accountLabel: "Main login",
  window: "weekly",
  resetsAt: soon(),
  offer: { account: "acct-2", label: "Claude 2", fiveHour: 18, weekly: 41, near: false },
});

let host: HTMLDivElement;
let root: Root;
const onContinue = vi.fn();

const bar = () => host.querySelector('[data-testid="limit-stop-bar"]');
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

async function render(withContinue = true) {
  await act(async () => {
    root.render(
      <LimitStopBar projectName="api" terminalId="pty-1" onContinue={withContinue ? onContinue : undefined} />,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  events.listeners.clear();
  bridge.ClaudeLimitStop.mockResolvedValue(weekly());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("LimitStopBar", () => {
  it("shows the stop and continues on the account with room in one click", async () => {
    await render();
    expect(bridge.ClaudeLimitStop).toHaveBeenCalledWith("pty-1");
    expect(bar()?.textContent).toContain("Main login hit its weekly limit");
    expect(bar()?.textContent).toContain("Claude 2 has room · 5-hour 18% · weekly 41%");
    act(() => button("Continue on Claude 2")!.click());
    expect(onContinue).toHaveBeenCalledWith("acct-2", "Claude 2");
  });

  it("lists the other accounts above the bar", async () => {
    await render();
    act(() => button("Other account")!.click());
    act(() => button("Claude 3")!.click());
    expect(onContinue).toHaveBeenCalledWith("acct-3", "Claude 3");
  });

  it("puts the bar away and tells the machine", async () => {
    await render();
    act(() => (host.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(bar()).toBeNull();
    expect(bridge.DismissClaudeLimitStop).toHaveBeenCalledWith("pty-1");
  });

  it("asks again when the project's terminals are listed again", async () => {
    bridge.ClaudeLimitStop.mockResolvedValue(null);
    await render();
    expect(bar()).toBeNull();
    bridge.ClaudeLimitStop.mockResolvedValue(weekly());
    await act(async () => events.listeners.get("terminals-changed")?.("api"));
    expect(bar()).not.toBeNull();
  });

  it("offers no move for a hold, only settings", async () => {
    bridge.ClaudeLimitStop.mockResolvedValue({ kind: "hold", account: "default", accountLabel: "Main login", resetsAt: 0 });
    await render();
    expect(button("Continue on Claude 2")).toBeUndefined();
    act(() => button("Open settings")!.click());
    expect(settings.open).toHaveBeenCalledWith(null);
  });

  it("offers no move for a single model's limit", async () => {
    bridge.ClaudeLimitStop.mockResolvedValue({
      kind: "model",
      account: "default",
      accountLabel: "Main login",
      model: "Opus",
      resetsAt: soon(),
    });
    await render();
    expect(bar()?.textContent).toContain("Main login hit its weekly Opus limit");
    expect(button("Continue on Claude 2")).toBeUndefined();
    expect(button("Other account")).toBeUndefined();
  });

  it("offers no move where the tab can't switch accounts", async () => {
    await render(false);
    expect(bar()).not.toBeNull();
    expect(button("Continue on Claude 2")).toBeUndefined();
  });

  it("hides a stop whose limit has reset", async () => {
    bridge.ClaudeLimitStop.mockResolvedValue({ ...weekly(), resetsAt: Math.floor(Date.now() / 1000) - 5 });
    await render();
    expect(bar()).toBeNull();
  });
});
