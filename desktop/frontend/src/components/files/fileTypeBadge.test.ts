import { describe, expect, it } from "vitest";
import { badgeForFile } from "./fileTypeBadge";

describe("badgeForFile", () => {
  it("labels by extension regardless of case", () => {
    expect(badgeForFile("App.TSX")).toEqual({ label: "TSX", tone: "blue" });
    expect(badgeForFile("config.yml")).toEqual({ label: "YAML", tone: "rose" });
  });

  it("recognises well-known bare names and env variants", () => {
    expect(badgeForFile("Dockerfile")?.label).toBe("DOCK");
    expect(badgeForFile(".gitignore")?.label).toBe("GIT");
    expect(badgeForFile(".env.local")?.label).toBe("ENV");
    expect(badgeForFile("LICENSE")?.label).toBe("LIC");
  });

  it("gives no badge to unknown or extension-less files", () => {
    expect(badgeForFile("CHANGELOG")).toBeNull();
    expect(badgeForFile("weird.xyz123")).toBeNull();
    expect(badgeForFile(".DS_Store")).toBeNull();
  });
});
