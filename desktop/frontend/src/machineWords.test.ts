import { describe, expect, it } from "vitest";
import { machineWords, revealLabel } from "./machineWords";

describe("machineWords", () => {
  it("keeps the macOS copy", () => {
    const m = machineWords(true);
    expect([m.thisMachine, m.ThisMachine, m.ThisMachineTitle, m.plural, m.Plural]).toEqual([
      "this Mac",
      "This Mac",
      "This Mac",
      "Macs",
      "Macs",
    ]);
    expect([m.anotherMachine, m.AnotherMachine, m.otherMachine, m.OtherMachine]).toEqual([
      "another Mac",
      "Another Mac",
      "the other Mac",
      "The other Mac",
    ]);
  });

  it("says computer on Linux and Windows", () => {
    const m = machineWords(false);
    expect([m.thisMachine, m.ThisMachine, m.ThisMachineTitle, m.Noun, m.Plural]).toEqual([
      "this computer",
      "This computer",
      "This Computer",
      "Computer",
      "Computers",
    ]);
  });
});

describe("revealLabel", () => {
  it("names each platform's file manager", () => {
    expect(revealLabel("macos")).toBe("Reveal in Finder");
    expect(revealLabel("windows")).toBe("Show in File Explorer");
    expect(revealLabel("linux")).toBe("Show in Files");
  });
});
