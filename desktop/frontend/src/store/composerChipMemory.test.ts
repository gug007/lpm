import { describe, expect, it } from "vitest";
import type { ChipSpec } from "../components/composerChips";
import { forgetChips, rememberChip, rememberedChips } from "./composerChipMemory";

const paste: ChipSpec = { kind: "paste", label: "Pasted text" };
const kept = (id: string) => [...rememberedChips(id).keys()].map((text) => text.length);

describe("composerChipMemory", () => {
  it("drops the oldest texts once they add up past the size budget", () => {
    rememberChip("t1", "a".repeat(900_000), paste);
    rememberChip("t1", "b".repeat(900_000), paste);
    rememberChip("t1", "c".repeat(900_000), paste);
    expect(kept("t1")).toEqual([900_000, 900_000]);
    expect(rememberedChips("t1").has("a".repeat(900_000))).toBe(false);
    forgetChips("t1");
  });

  it("keeps the newest text however large it is", () => {
    rememberChip("t2", "small", paste);
    rememberChip("t2", "x".repeat(3_000_000), paste);
    expect(kept("t2")).toEqual([3_000_000]);
    forgetChips("t2");
  });

  it("counts a text remembered again once", () => {
    for (let i = 0; i < 5; i += 1) rememberChip("t3", "y".repeat(900_000), paste);
    rememberChip("t3", "z".repeat(900_000), paste);
    expect(kept("t3")).toEqual([900_000, 900_000]);
    forgetChips("t3");
  });
});
