import { describe, expect, it } from "vitest";
import {
  access,
  askerLabel,
  hereSummary,
  runHereSummary,
  runThereSummary,
  scope,
  thereSummary,
} from "./agentFilesWords";

describe("agentFilesWords", () => {
  it("reads what a machine reported, unknown as off", () => {
    expect(access("write")).toBe("write");
    expect(access(null)).toBe("off");
    expect(access("everything")).toBe("off");
    expect(scope("home")).toBe("home");
    expect(scope(undefined)).toBe("projects");
  });

  it("says what agents may copy on each side", () => {
    expect(thereSummary("read", "projects")).toBe(
      "Agents here can copy files from it, in its lpm projects. You allow each copy first.",
    );
    expect(thereSummary("off", "home")).toContain("Off.");
    expect(hereSummary("write", "home")).toContain("to and from");
    expect(hereSummary("write", "home")).toContain("your home folder and lpm projects");
  });

  it("says whether agents may run commands on each side", () => {
    expect(runThereSummary(false)).toContain("Off.");
    expect(runThereSummary(true)).toBe(
      "Agents here can run commands there, as your account on it. You allow each one first, or once for a tab.",
    );
    expect(runHereSummary(false)).toContain("can't run commands");
    expect(runHereSummary(true)).toContain("as you, once someone over there allows each one");
  });

  it("names the asker by what lpm could tell", () => {
    expect(askerLabel({ agent: "Codex", project: "shop" })).toBe("Codex in shop");
    expect(askerLabel({ agent: "", project: "shop" })).toBe("a command in shop");
    expect(askerLabel({ agent: "", project: "" })).toBe("a program outside lpm's terminals");
    expect(askerLabel({ agent: "", project: "shop", kind: "run" })).toBe("a program in shop");
  });
});
