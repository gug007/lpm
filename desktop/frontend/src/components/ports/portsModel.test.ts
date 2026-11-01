import { describe, expect, it } from "vitest";
import {
  holderName,
  isOutside,
  matchesFilter,
  projectPortCount,
  uptimeLabel,
  type ListeningPort,
} from "./portsModel";

const row = (over: Partial<ListeningPort> = {}): ListeningPort => ({
  port: 3000,
  pid: 10,
  process: "node",
  project: "storefront",
  projectLabel: "storefront",
  parent: "",
  service: "web",
  terminal: "",
  own: false,
  startedAt: 0,
  machine: "local",
  machineName: "This Mac",
  ...over,
});

describe("uptimeLabel", () => {
  const now = 1_000_000 * 1000;
  it("says nothing for an unknown start", () => expect(uptimeLabel(0, now)).toBe(""));
  it("counts in the largest whole unit", () => {
    expect(uptimeLabel(1_000_000 - 30, now)).toBe("now");
    expect(uptimeLabel(1_000_000 - 41 * 60, now)).toBe("41m");
    expect(uptimeLabel(1_000_000 - 2 * 3600 - 5, now)).toBe("2h");
    expect(uptimeLabel(1_000_000 - 3 * 86400, now)).toBe("3d");
  });
});

describe("matchesFilter", () => {
  it("matches a port by its leading digits, with or without a colon", () => {
    expect(matchesFilter(row(), "30")).toBe(true);
    expect(matchesFilter(row(), ":3000")).toBe(true);
    expect(matchesFilter(row(), "300")).toBe(true);
    expect(matchesFilter(row(), "4000")).toBe(false);
  });
  it("matches names case-insensitively", () => {
    expect(matchesFilter(row(), "STORE")).toBe(true);
    expect(matchesFilter(row({ project: "", service: "", process: "postgres" }), "postgres")).toBe(true);
    expect(matchesFilter(row(), "mac")).toBe(true);
    expect(matchesFilter(row(), "redis")).toBe(false);
  });
});

describe("holderName and isOutside", () => {
  it("names the service, the tab, the process or lpm", () => {
    expect(holderName(row())).toBe("web");
    expect(holderName(row({ service: "", terminal: "npm run dev" }))).toBe("npm run dev");
    expect(holderName(row({ project: "", service: "", process: "postgres" }))).toBe("postgres");
    expect(holderName(row({ project: "", service: "", own: true }))).toBe("lpm");
  });
  it("treats only a port nothing of lpm's holds as outside", () => {
    expect(isOutside(row())).toBe(false);
    expect(isOutside(row({ project: "", own: true }))).toBe(false);
    expect(isOutside(row({ project: "" }))).toBe(true);
  });
});

describe("projectPortCount", () => {
  it("counts this computer's project ports only", () => {
    const ports = [row(), row({ project: "" }), row({ machine: "0a1b2c3d" })];
    expect(projectPortCount(ports)).toBe(1);
  });
});
