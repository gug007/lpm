import { describe, expect, it } from "vitest";
import { DEFAULT_TAILNET_STATE, tailnetView, type TailnetState } from "./tailnetStatus";

const on = (patch: Partial<TailnetState>): TailnetState => ({
  ...DEFAULT_TAILNET_STATE,
  enabled: true,
  ...patch,
});

describe("tailnetView", () => {
  it("offers setup while switched off", () => {
    expect(tailnetView(DEFAULT_TAILNET_STATE)).toEqual({ tone: "off", label: "Off", step: "setUp" });
  });

  it("says why on a machine that can't run the node", () => {
    expect(
      tailnetView({
        ...DEFAULT_TAILNET_STATE,
        available: false,
        error: "Needs macOS 12 or later.",
      }),
    ).toEqual({ tone: "off", label: "Needs macOS 12 or later.", step: "none" });
  });

  it("points at the admin console when the tailnet blocks the device", () => {
    expect(tailnetView(on({ state: "stopped", error: "Your tailnet requires network logging" })).step).toBe(
      "blocked",
    );
  });

  it("names the account once connected", () => {
    expect(tailnetView(on({ state: "running", account: "me@example.com" }))).toEqual({
      tone: "live",
      label: "Connected as me@example.com",
      step: "none",
    });
  });

  it("asks for a sign-in when the node needs one", () => {
    expect(tailnetView(on({ state: "needsLogin" })).step).toBe("signIn");
  });

  it("points at the admin console while a device waits for approval", () => {
    expect(tailnetView(on({ state: "needsApproval" })).step).toBe("approve");
  });

  it("treats a switched-on node that reports nothing yet as starting", () => {
    expect(tailnetView(on({ state: "off" }))).toEqual({
      tone: "starting",
      label: "Starting…",
      step: "none",
    });
  });

  it("offers a retry when the node could not start", () => {
    expect(tailnetView(on({ state: "off", error: "Built-in Tailscale stopped" }))).toEqual({
      tone: "problem",
      label: "Couldn't start",
      step: "retry",
    });
  });
});
