import { describe, expect, it } from "vitest";
import { projectStartProfile } from "./projectStartProfile";

describe("projectStartProfile", () => {
  it("uses the active profile", () => {
    expect(
      projectStartProfile({
        activeProfile: "api",
        profiles: [
          { name: "web", services: ["web"] },
          { name: "api", services: ["api"] },
        ],
      }),
    ).toBe("api");
  });

  it("uses the first profile when none is active", () => {
    expect(
      projectStartProfile({
        activeProfile: "",
        profiles: [{ name: "web", services: ["web"] }],
      }),
    ).toBe("web");
  });

  it("uses all services when there are no profiles", () => {
    expect(projectStartProfile({ activeProfile: "", profiles: [] })).toBe("");
  });
});
