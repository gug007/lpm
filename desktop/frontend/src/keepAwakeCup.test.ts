import { describe, expect, it } from "vitest";
import type { KeepAwakeState } from "./keepAwake";
import { keepAwakeCup } from "./keepAwakeCup";

const BASE: KeepAwakeState = {
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

const with_ = (patch: Partial<KeepAwakeState>): KeepAwakeState => ({ ...BASE, ...patch });
const HOUR = 3_600_000;

describe("keepAwakeCup", () => {
  it("shows nothing while off", () => {
    expect(keepAwakeCup(with_({}), null, null)).toBeNull();
    expect(keepAwakeCup(null, null, null)).toBeNull();
  });

  it("is an empty cup while it waits for an agent", () => {
    expect(keepAwakeCup(with_({ mode: "agents" }), null, null)).toEqual({
      tone: "ready",
      level: null,
      text: null,
      mark: null,
    });
  });

  it("is full while agents work or until turned off", () => {
    expect(keepAwakeCup(with_({ mode: "agents", active: true, agents: 2 }), null, null)).toEqual({
      tone: "held",
      level: 1,
      text: "2 agents",
      mark: null,
    });
    expect(keepAwakeCup(with_({ mode: "always", active: true }), null, null)).toEqual({
      tone: "held",
      level: 1,
      text: null,
      mark: null,
    });
  });

  it("drains with a countdown and says what is left", () => {
    const look = keepAwakeCup(with_({ mode: "timed", active: true }), 1.7 * HOUR, 2 * HOUR);
    expect(look?.tone).toBe("held");
    expect(look?.level).toBeCloseTo(0.85);
    expect(look?.text).toBe("1h 42m");
    expect(keepAwakeCup(with_({ mode: "agents", active: true }), 12 * 60_000, 30 * 60_000)?.text).toBe("12m");
  });

  it("turns amber in the last five minutes", () => {
    expect(keepAwakeCup(with_({ mode: "timed", active: true }), 272_000, 2 * HOUR)).toMatchObject({
      tone: "ending",
      text: "4:32",
    });
    expect(keepAwakeCup(with_({ mode: "timed", active: true }), 6 * 60_000, 2 * HOUR)?.tone).toBe("held");
  });

  it("marks a cup that is on but can't hold, keeping the error mark for a real failure", () => {
    expect(keepAwakeCup(with_({ mode: "always", power: "battery" }), null, null)).toMatchObject({
      tone: "stopped",
      level: null,
      mark: "battery",
      text: null,
    });
    expect(keepAwakeCup(with_({ mode: "agents", power: "low", floor: 30 }), null, null)).toMatchObject({
      mark: "battery",
      text: "30%",
    });
    expect(keepAwakeCup(with_({ mode: "timed", power: "failed" }), 60_000, HOUR)).toMatchObject({
      tone: "stopped",
      mark: "error",
    });
  });
});
