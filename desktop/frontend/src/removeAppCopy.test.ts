import { describe, expect, it } from "vitest";
import { removeAppConfirmText, removeAppDescription } from "./removeAppCopy";

describe("removeAppDescription", () => {
  it("keeps the macOS wording", () => {
    expect(removeAppDescription("macos")).toBe(
      "Uninstall lpm and everything it installed on this Mac",
    );
  });

  it("does not promise to uninstall the app elsewhere", () => {
    for (const p of ["linux", "windows"] as const) {
      expect(removeAppDescription(p)).not.toMatch(/^Uninstall/);
      expect(removeAppDescription(p)).toContain("before you uninstall it");
    }
  });
});

describe("removeAppConfirmText", () => {
  it("sends Windows users to Installed apps", () => {
    const text = removeAppConfirmText("windows");
    expect(text).toContain("this computer");
    expect(text).toContain("Settings > Apps > Installed apps");
    expect(text).not.toContain("AppImage");
  });

  it("sends Linux users to their package manager or AppImage", () => {
    const text = removeAppConfirmText("linux");
    expect(text).toContain("package manager");
    expect(text).toContain("AppImage");
    expect(text).not.toContain("Settings > Apps");
  });
});
