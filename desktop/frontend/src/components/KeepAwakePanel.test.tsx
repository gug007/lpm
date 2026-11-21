// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import type { KeepAwakeState } from "../keepAwake";
import { KeepAwakePanel } from "./KeepAwakePanel";

const mocks = vi.hoisted(() => ({ keepAwakeLid: vi.fn(), peerInvoke: vi.fn() }));
vi.mock("../../bridge/commands", () => ({
  KeepAwakeLid: mocks.keepAwakeLid,
  PeerInvoke: mocks.peerInvoke,
  KeepAwakeState: vi.fn(),
  KeepAwakeSet: vi.fn(),
  KeepAwakeSetPrefs: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));

let container: HTMLDivElement;
let root: Root;

const STATE: KeepAwakeState = {
  supported: true,
  screenSupported: true,
  mode: "off",
  active: false,
  agents: 0,
  endsIn: null,
  tailMinutes: 5,
  screen: false,
  battery: true,
  floor: 20,
  power: "idle",
};

function session(patch: Partial<KeepAwakeState>, endsAt: number | null = null): KeepAwakeSession {
  return {
    state: { ...STATE, ...patch },
    endsAt,
    error: null,
    set: vi.fn(),
    extend: vi.fn(),
    setPrefs: vi.fn(),
  };
}

async function render(s: KeepAwakeSession, slug: string | null = null) {
  act(() => root.render(<KeepAwakePanel session={s} title="Keep this Mac awake" machine="this Mac" slug={slug} />));
  await act(async () => {});
}

const button = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.keepAwakeLid.mockResolvedValue({ lid: "none", onPower: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("KeepAwakePanel status", () => {
  it("wears a pill for each state and a short line", async () => {
    await render(session({}));
    expect(container.textContent).toContain("Off");
    expect(container.textContent).toContain("Sleeps on its usual schedule");

    await render(session({ mode: "agents" }));
    expect(container.textContent).toContain("Waiting");
    expect(container.textContent).toContain("Turns on when an agent starts");

    await render(session({ mode: "agents", active: true, agents: 2, power: "awake" }));
    expect(container.textContent).toContain("Awake");
    expect(container.querySelector("b")?.textContent).toBe("2 agents");

    await render(session({ mode: "always", power: "battery" }));
    expect(container.textContent).toContain("Paused");
    expect(container.textContent).toContain("On battery, so this Mac can sleep.");
  });
});

describe("KeepAwakePanel set time", () => {
  it("adds to a set time that is running, and Change… starts over", async () => {
    const s = session({ mode: "timed", active: true, power: "awake" }, Date.now() + 60 * 60_000);
    await render(s);

    expect(button("30m")).toBeUndefined();
    click(button("+1h"));
    expect(s.extend).toHaveBeenCalledWith(60);
    click(button("+30m"));
    expect(s.extend).toHaveBeenCalledWith(30);

    click(button("Change…"));
    expect(button("+1h")).toBeUndefined();
    click(button("4h"));
    expect(s.set).toHaveBeenCalledWith("timed", 240);
  });

  it("goes back to the time running from the presets", async () => {
    await render(session({ mode: "timed", active: true, power: "awake" }, Date.now() + 60 * 60_000));
    click(button("Change…"));
    click(container.querySelector('[aria-label="Back to the time running"]')!);
    expect(button("+2h")).toBeDefined();
  });

  it("starts a set time that ends at a time of day", async () => {
    const s = session({});
    await render(s);
    click(button("Custom…"));
    click(button("Until"));

    const hours = container.querySelector<HTMLInputElement>("#keep-awake-until-hours")!;
    const minutes = container.querySelector<HTMLInputElement>("#keep-awake-until-minutes")!;
    expect(hours.value).toBe(String((new Date().getHours() + 2) % 24));
    expect(minutes.value).toBe("00");
    expect(container.textContent).toMatch(/today|tomorrow/);

    click(button("Start"));
    const [mode, total] = (s.set as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(mode).toBe("timed");
    expect(total).toBeGreaterThan(60);
    expect(total).toBeLessThanOrEqual(120);
  });
});

describe("KeepAwakePanel lid note", () => {
  it("warns on a laptop that would sleep, and says when a display keeps it going", async () => {
    mocks.keepAwakeLid.mockResolvedValue({ lid: "sleeps", onPower: false });
    await render(session({ mode: "agents" }));
    expect(container.textContent).toContain("Closing the lid will put it to sleep.");

    mocks.keepAwakeLid.mockResolvedValue({ lid: "stays", onPower: true });
    act(() => root.unmount());
    root = createRoot(container);
    await render(session({ mode: "agents" }));
    expect(container.textContent).toContain("Display and power connected: you can close the lid.");
  });

  it("says nothing without a lid, or while Keep awake is off", async () => {
    await render(session({ mode: "agents" }));
    expect(container.textContent).not.toContain("lid");

    mocks.keepAwakeLid.mockResolvedValue({ lid: "sleeps", onPower: true });
    act(() => root.unmount());
    root = createRoot(container);
    await render(session({}));
    expect(container.textContent).not.toContain("lid");
  });

  it("keeps the general sentence for a computer that can't say", async () => {
    mocks.peerInvoke.mockRejectedValue(new Error("unknown command"));
    await render(session({ mode: "agents" }), "studio");
    expect(mocks.peerInvoke).toHaveBeenCalledWith("studio", "keep_awake_lid", {});
    expect(container.textContent).toMatch(/lid/);
  });
});
