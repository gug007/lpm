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
  it("shows nothing while off, and an empty cup counting connected computers that are on", () => {
    expect(keepAwakeCup(with_({}), null, null, 0)).toBeNull();
    expect(keepAwakeCup(null, null, null, 0)).toBeNull();
    expect(keepAwakeCup(with_({}), null, null, 2)).toEqual({ tone: "ready", level: null, text: null, mark: null, others: 2 });
  });

  it("is an empty cup while it waits for an agent", () => {
    expect(keepAwakeCup(with_({ mode: "agents" }), null, null, 0)).toEqual({
      tone: "ready",
      level: null,
      text: null,
      mark: null,
      others: 0,
    });
  });

  it("is full while agents work or until turned off", () => {
    expect(keepAwakeCup(with_({ mode: "agents", active: true, agents: 2 }), null, null, 0)).toEqual({
      tone: "held",
      level: 1,
      text: "2 agents",
      mark: null,
      others: 0,
    });
    expect(keepAwakeCup(with_({ mode: "always", active: true }), null, null, 1)).toEqual({
      tone: "held",
      level: 1,
      text: null,
      mark: null,
      others: 1,
    });
  });

  it("drains with a countdown and says what is left", () => {
    const look = keepAwakeCup(with_({ mode: "timed", active: true }), 1.7 * HOUR, 2 * HOUR, 0);
    expect(look?.tone).toBe("held");
    expect(look?.level).toBeCloseTo(0.85);
    expect(look?.text).toBe("1h 42m");
    expect(keepAwakeCup(with_({ mode: "agents", active: true }), 12 * 60_000, 30 * 60_000, 0)?.text).toBe("12m");
  });

  it("turns amber in the last five minutes", () => {
    expect(keepAwakeCup(with_({ mode: "timed", active: true }), 272_000, 2 * HOUR, 0)).toMatchObject({
      tone: "ending",
      text: "4:32",
    });
    expect(keepAwakeCup(with_({ mode: "timed", active: true }), 6 * 60_000, 2 * HOUR, 0)?.tone).toBe("held");
  });

  it("marks a cup that is on but can't hold, keeping the error mark for a real failure", () => {
    expect(keepAwakeCup(with_({ mode: "always", power: "battery" }), null, null, 0)).toMatchObject({
      tone: "stopped",
      level: null,
      mark: "battery",
      text: null,
    });
    expect(keepAwakeCup(with_({ mode: "agents", power: "low", floor: 30 }), null, null, 0)).toMatchObject({
      mark: "battery",
      text: "30%",
    });
    expect(keepAwakeCup(with_({ mode: "timed", power: "failed" }), 60_000, HOUR, 0)).toMatchObject({
      tone: "stopped",
      mark: "error",
    });
  });
});
