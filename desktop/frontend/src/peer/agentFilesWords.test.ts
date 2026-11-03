import { describe, expect, it } from "vitest";
import { access, askerLabel, hereSummary, scope, thereSummary } from "./agentFilesWords";

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

  it("names the asker by what lpm could tell", () => {
    expect(askerLabel({ agent: "Codex", project: "shop" })).toBe("Codex in shop");
    expect(askerLabel({ agent: "", project: "shop" })).toBe("a command in shop");
    expect(askerLabel({ agent: "", project: "" })).toBe("a program outside lpm's terminals");
  });
});
