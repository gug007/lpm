import { describe, expect, it } from "vitest";
import {
  clock,
  countdownSpan,
  customMinutes,
  keepAwakeBadge,
  keepAwakeCupLabel,
  keepAwakeHeadsUp,
  keepAwakeLine,
  keepAwakePowerNote,
  readKeepAwake,
  span,
  tailChoices,
  tailLabel,
  type KeepAwakeState,
} from "./keepAwake";

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

describe("readKeepAwake", () => {
  it("reads the backend's state and fills what an older one leaves out", () => {
    expect(readKeepAwake({ mode: "agents", agents: 2, active: true })).toEqual({
      ...BASE,
      mode: "agents",
      agents: 2,
      active: true,
      screenSupported: false,
    });
  });

  it("rejects anything that isn't a state", () => {
    expect(readKeepAwake(null)).toBeNull();
    expect(readKeepAwake("off")).toBeNull();
    expect(readKeepAwake({ mode: "forever" })).toBeNull();
  });
});

describe("time words", () => {
  it("counts down in minutes and seconds, then hours", () => {
    expect(clock(272_000)).toBe("4:32");
    expect(clock(1)).toBe("0:01");
    expect(clock(0)).toBe("0:00");
    expect(clock(89 * 60_000 + 58_000)).toBe("1:29:58");
  });

  it("spells lengths and presets", () => {
    expect(span(45)).toBe("45 min");
    expect(span(120)).toBe("2 h");
    expect(span(90)).toBe("1 h 30 min");
    expect(tailLabel(0)).toBe("no extra time");
    expect(tailLabel(5)).toBe("5 min");
  });

  it("reads custom hours and minutes", () => {
    expect(customMinutes("1", "30")).toBe(90);
    expect(customMinutes("", "45")).toBe(45);
    expect(customMinutes("2", "")).toBe(120);
    expect(customMinutes("0", "0")).toBeNull();
    expect(customMinutes("1", "60")).toBeNull();
    expect(customMinutes("100", "0")).toBeNull();
    expect(customMinutes("1.5", "0")).toBeNull();
  });
});

describe("tailChoices", () => {
  it("offers four extra times, plus one set elsewhere", () => {
    expect(tailChoices(5)).toEqual([0, 5, 15, 30]);
    expect(tailChoices(10)).toEqual([0, 5, 10, 15, 30]);
  });
});

describe("keepAwakeBadge", () => {
  it("says nothing while off", () => {
    expect(keepAwakeBadge(with_({}), null)).toBeNull();
  });

  it("names the agents holding it, then the countdown after them", () => {
    expect(keepAwakeBadge(with_({ mode: "agents", agents: 1, active: true }), null)).toBe("1 agent");
    expect(keepAwakeBadge(with_({ mode: "agents", agents: 3, active: true }), null)).toBe("3 agents");
    expect(keepAwakeBadge(with_({ mode: "agents", active: true }), 299_000)).toBe("4:59");
  });

  it("waits quietly for agents when none work", () => {
    expect(keepAwakeBadge(with_({ mode: "agents" }), null)).toBe("Agents");
  });

  it("counts a set time down and reads On until turned off", () => {
    expect(keepAwakeBadge(with_({ mode: "timed", active: true }), 3_600_000)).toBe("1:00:00");
    expect(keepAwakeBadge(with_({ mode: "always", active: true }), null)).toBe("On");
  });
});

describe("keepAwakeLine", () => {
  const now = new Date(2026, 10, 2, 14, 0).getTime();

  it("tells what holds and for how long", () => {
    expect(keepAwakeLine(with_({}), null, now)).toBe("Sleeps on its usual schedule.");
    expect(keepAwakeLine(with_({ mode: "agents", agents: 2, active: true }), null, now)).toBe(
      "2 agents working. Stays awake 5 min after the last one finishes.",
    );
    expect(keepAwakeLine(with_({ mode: "agents", agents: 1, active: true, tailMinutes: 0 }), null, now)).toBe(
      "1 agent working. Can sleep as soon as the last one finishes.",
    );
    expect(keepAwakeLine(with_({ mode: "agents", active: true }), 125_000, now)).toBe(
      "Agents finished. Can sleep in 2:05 unless another one starts.",
    );
    expect(keepAwakeLine(with_({ mode: "agents" }), null, now)).toBe(
      "No agent is working. Stays awake when the next one starts.",
    );
    expect(keepAwakeLine(with_({ mode: "always", active: true }), null, now)).toBe("Awake until you turn it off.");
  });

  it("names the day when a set time ends on another one", () => {
    const line = keepAwakeLine(with_({ mode: "timed", active: true }), 12 * 3_600_000, now);
    expect(line).toMatch(/^Awake until Tomorrow .+ · 12 h left\.$/);
  });

  it("names the end of a set time", () => {
    const line = keepAwakeLine(with_({ mode: "timed", active: true }), 90 * 60_000, now);
    expect(line).toMatch(/^Awake until .+ · 1 h 30 min left\.$/);
    expect(line).toContain(new Date(now + 90 * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  });
});

describe("keepAwakePowerNote", () => {
  it("explains why a mode that is on doesn't hold right now", () => {
    expect(keepAwakePowerNote(with_({ mode: "always", power: "battery" }), "this Mac")).toContain("On battery");
    expect(keepAwakePowerNote(with_({ mode: "always", power: "low" }), "this Mac")).toBe(
      "Battery at 20% or less, so this Mac can sleep.",
    );
    expect(keepAwakePowerNote(with_({ mode: "agents", power: "failed" }), "Studio")).toContain("Couldn't keep Studio awake");
    expect(keepAwakePowerNote(with_({ mode: "always", power: "awake" }), "this Mac")).toBeNull();
  });

  it("stays quiet while off", () => {
    expect(keepAwakePowerNote(with_({ power: "battery" }), "this Mac")).toBeNull();
  });
});

describe("keepAwakeHeadsUp", () => {
  it("names the machine, the minutes left and why", () => {
    expect(keepAwakeHeadsUp("This Mac", "timed", 5 * 60_000)).toEqual({
      title: "This Mac can sleep in 5 min",
      description: "The time you set is running out.",
    });
    expect(keepAwakeHeadsUp("Studio", "agents", 4 * 60_000 + 1).title).toBe("Studio can sleep in 5 min");
    expect(keepAwakeHeadsUp("Studio", "agents", 0).description).toBe(
      "Agents finished, and the time after them is running out.",
    );
  });
});

describe("countdownSpan", () => {
  const MIN = 60_000;

  it("measures a new countdown from when it is first seen", () => {
    expect(countdownSpan(null, 1_000 + 30 * MIN, 1_000)).toEqual({ endsAt: 1_000 + 30 * MIN, ms: 30 * MIN });
    expect(countdownSpan(null, null, 1_000)).toBeNull();
  });

  it("keeps the span while events re-derive the same end", () => {
    const span = countdownSpan(null, 30 * MIN, 0);
    expect(countdownSpan(span, 30 * MIN + 400, 10 * MIN)).toBe(span);
    expect(countdownSpan(span, 30 * MIN - 400, 10 * MIN)).toBe(span);
  });

  it("starts over when the end moves, as +1 h or a new time does", () => {
    const span = countdownSpan(null, 30 * MIN, 0);
    expect(countdownSpan(span, 90 * MIN, 20 * MIN)).toEqual({ endsAt: 90 * MIN, ms: 70 * MIN });
    expect(countdownSpan(span, 25 * MIN, 20 * MIN)).toEqual({ endsAt: 25 * MIN, ms: 5 * MIN });
  });
});

describe("keepAwakeCupLabel", () => {
  it("says why the machine is awake and for how long", () => {
    expect(keepAwakeCupLabel(with_({ mode: "agents", active: true, agents: 1 }), null)).toBe("1 agent working");
    expect(keepAwakeCupLabel(with_({ mode: "agents", active: true }), 4 * 60_000 + 1)).toBe("5 min left");
    expect(keepAwakeCupLabel(with_({ mode: "timed", active: true }), 90 * 60_000)).toBe("1 h 30 min left");
    expect(keepAwakeCupLabel(with_({ mode: "timed", active: true }), 0)).toBe("1 min left");
    expect(keepAwakeCupLabel(with_({ mode: "always", active: true }), null)).toBe("until you turn it off");
  });
});
