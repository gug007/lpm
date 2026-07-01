import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATORS,
  emptyGeneratorsConfig,
  resolveGenerators,
  applyReorder,
  applyHideDefault,
  applyRestoreDefault,
  applyAddCustom,
  applyUpdateGenerator,
  applyDeleteCustom,
  normalizeGeneratorsConfig,
} from "./generators";
import type { Generator } from "./types";

const custom = (id: string, label = id): Generator => ({
  id,
  label,
  icon: { type: "emoji", value: "🦀" },
  prompt: `build ${label}`,
});

describe("resolveGenerators", () => {
  it("returns the built-in defaults for an empty config", () => {
    const list = resolveGenerators(emptyGeneratorsConfig());
    expect(list.map((g) => g.id)).toEqual(DEFAULT_GENERATORS.map((g) => g.id));
    expect(list[0].builtin).toBe(true);
  });

  it("hides defaults listed in hiddenDefaults", () => {
    const cfg = { ...emptyGeneratorsConfig(), hiddenDefaults: ["nextjs"] };
    expect(resolveGenerators(cfg)).toEqual([]);
  });

  it("applies overrides onto a default", () => {
    const cfg = { ...emptyGeneratorsConfig(), overrides: { nextjs: { prompt: "custom" } } };
    expect(resolveGenerators(cfg)[0].prompt).toBe("custom");
  });

  it("appends custom generators after defaults and marks them non-builtin", () => {
    const cfg = { ...emptyGeneratorsConfig(), custom: [custom("expo")] };
    const list = resolveGenerators(cfg);
    expect(list.map((g) => g.id)).toEqual(["nextjs", "expo"]);
    expect(list[1].builtin).toBe(false);
  });

  it("honours explicit order, leaving unknown ids in their original sequence", () => {
    const cfg = {
      ...emptyGeneratorsConfig(),
      custom: [custom("expo"), custom("rust")],
      order: ["expo", "nextjs"],
    };
    expect(resolveGenerators(cfg).map((g) => g.id)).toEqual(["expo", "nextjs", "rust"]);
  });
});

describe("transforms", () => {
  it("applyReorder writes an order matching the new sequence", () => {
    const cfg = { ...emptyGeneratorsConfig(), custom: [custom("a"), custom("b")] };
    const next = applyReorder(resolveGenerators(cfg), cfg, "b", "nextjs");
    expect(next.order).toEqual(["b", "nextjs", "a"]);
  });

  it("applyReorder leaves the config unchanged for an unknown id", () => {
    const cfg = { ...emptyGeneratorsConfig(), custom: [custom("a"), custom("b")] };
    const resolved = resolveGenerators(cfg);
    expect(applyReorder(resolved, cfg, "nope", "nextjs").order).toEqual(cfg.order);
  });

  it("applyHideDefault then applyRestoreDefault round-trips", () => {
    const hidden = applyHideDefault(emptyGeneratorsConfig(), "nextjs");
    expect(hidden.hiddenDefaults).toEqual(["nextjs"]);
    const restored = applyRestoreDefault(hidden, "nextjs");
    expect(restored.hiddenDefaults).toEqual([]);
  });

  it("applyHideDefault is idempotent", () => {
    const once = applyHideDefault(emptyGeneratorsConfig(), "nextjs");
    const twice = applyHideDefault(once, "nextjs");
    expect(twice.hiddenDefaults).toEqual(["nextjs"]);
  });

  it("applyAddCustom adds a record with a generated id", () => {
    const next = applyAddCustom(emptyGeneratorsConfig(), {
      label: "Expo",
      icon: { type: "emoji", value: "📱" },
      prompt: "init expo",
    });
    expect(next.custom).toHaveLength(1);
    expect(next.custom[0].id).toBeTruthy();
    expect(next.custom[0].label).toBe("Expo");
  });

  it("applyUpdateGenerator edits a custom record in place", () => {
    const base = applyAddCustom(emptyGeneratorsConfig(), {
      label: "Expo",
      icon: { type: "emoji", value: "📱" },
      prompt: "init expo",
    });
    const id = base.custom[0].id;
    const next = applyUpdateGenerator(base, id, { prompt: "new" }, false);
    expect(next.custom[0].prompt).toBe("new");
  });

  it("applyUpdateGenerator on a default writes an override", () => {
    const next = applyUpdateGenerator(emptyGeneratorsConfig(), "nextjs", { prompt: "x" }, true);
    expect(next.overrides.nextjs.prompt).toBe("x");
  });

  it("applyUpdateGenerator on a default twice accumulates fields", () => {
    const first = applyUpdateGenerator(emptyGeneratorsConfig(), "nextjs", { prompt: "a" }, true);
    const second = applyUpdateGenerator(first, "nextjs", { label: "b" }, true);
    expect(second.overrides.nextjs).toEqual({ prompt: "a", label: "b" });
  });

  it("applyDeleteCustom removes the record and its order entry", () => {
    const base = applyAddCustom(emptyGeneratorsConfig(), {
      label: "Expo",
      icon: { type: "emoji", value: "📱" },
      prompt: "p",
    });
    const id = base.custom[0].id;
    const ordered = { ...base, order: [id, "nextjs"] };
    const next = applyDeleteCustom(ordered, id);
    expect(next.custom).toEqual([]);
    expect(next.order).toEqual(["nextjs"]);
  });
});

describe("normalizeGeneratorsConfig", () => {
  it("coerces missing/garbage fields to a valid empty config", () => {
    expect(normalizeGeneratorsConfig(undefined)).toEqual(emptyGeneratorsConfig());
    expect(normalizeGeneratorsConfig({ order: "bad", custom: null })).toEqual(emptyGeneratorsConfig());
  });

  it("drops a malformed override value", () => {
    expect(normalizeGeneratorsConfig({ overrides: { nextjs: "bad" } }).overrides).toEqual({});
  });

  it("drops a custom entry with a malformed icon", () => {
    expect(
      normalizeGeneratorsConfig({
        custom: [{ id: "x", label: "y", prompt: "p", icon: { type: "bogus", value: 1 } }],
      }).custom,
    ).toEqual([]);
  });

  it("keeps a valid promptActions array", () => {
    const actions = [{ id: "x", icon: "sparkles", label: "X", instruction: "do x", enabled: true }];
    const cfg = normalizeGeneratorsConfig({ promptActions: actions });
    expect(cfg.promptActions).toEqual(actions);
  });

  it("drops a malformed promptActions (omits the key)", () => {
    expect(normalizeGeneratorsConfig({ promptActions: "not an array" }).promptActions).toBeUndefined();
    expect(normalizeGeneratorsConfig({ promptActions: 42 }).promptActions).toBeUndefined();
  });
});
