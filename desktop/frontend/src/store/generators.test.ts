import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
vi.mock("../../bridge/commands", () => ({
  LoadGenerators: async () => ({ order: [], hiddenDefaults: [], overrides: {}, custom: [] }),
  SaveGenerators: (g: unknown) => save(g),
}));

import { useGeneratorsStore } from "./generators";
import { resolveGenerators } from "../generators";

describe("generators store", () => {
  beforeEach(() => {
    save.mockClear();
    useGeneratorsStore.setState({ config: { order: [], hiddenDefaults: [], overrides: {}, custom: [] } });
  });

  it("addCustom persists and shows up in the resolved list", async () => {
    await useGeneratorsStore.getState().addCustom({
      label: "Expo",
      icon: { type: "emoji", value: "📱" },
      type: "ai",
      prompt: "init",
    });
    expect(save).toHaveBeenCalledTimes(1);
    const ids = resolveGenerators(useGeneratorsStore.getState().config).map((g) => g.id);
    expect(ids).toContain("nextjs");
    expect(ids.length).toBe(2);
  });

  it("hideDefault then restoreDefault toggles visibility", async () => {
    await useGeneratorsStore.getState().hideDefault("nextjs");
    expect(resolveGenerators(useGeneratorsStore.getState().config)).toHaveLength(0);
    await useGeneratorsStore.getState().restoreDefault("nextjs");
    expect(resolveGenerators(useGeneratorsStore.getState().config)).toHaveLength(1);
  });
});
