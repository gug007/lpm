import { describe, expect, it } from "vitest";
import { readyLabel, readyStateKey } from "./serviceReadyState";

describe("service ready state", () => {
  it("labels each state for the tab", () => {
    expect(readyLabel({ readiness: "waiting", waitingFor: ["api"] })).toEqual({
      text: "Waiting for api",
      title: "Starts once api is ready",
    });
    expect(readyLabel({ readiness: "waiting", waitingFor: ["api", "db", "cache"] })?.title).toBe(
      "Starts once api, db and cache are ready",
    );
    expect(readyLabel({ readiness: "starting" })?.text).toBe("Starting");
    expect(readyLabel({ readiness: "notReady", readyError: "Not ready after 30s" })?.title).toMatch(
      /^Not ready after 30s\. /,
    );
    expect(readyLabel({})).toBeNull();
  });

  it("keys change only with a ready state", () => {
    const a = readyStateKey([{ name: "web" }, { name: "api", readiness: "starting" }]);
    expect(readyStateKey([{ name: "web" }, { name: "api", readiness: "starting" }])).toBe(a);
    expect(readyStateKey([{ name: "web" }, { name: "api" }])).not.toBe(a);
  });
});
