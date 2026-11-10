// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobOfflineGroup } from "./JobOfflineGroup";
import type { PeerClient } from "../../../peer/usePeerState";

const bridge = vi.hoisted(() => ({ PeerReconnect: vi.fn(async () => {}) }));
vi.mock("../../../../bridge/commands", () => bridge);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const peer = (fields: Partial<PeerClient>): PeerClient =>
  ({ slug: "aaaaaaaa", alias: "taucloud", host: "10.0.0.5", port: 1, enabled: true, connected: false, ...fields }) as PeerClient;

const show = (fields: Partial<PeerClient> = {}) =>
  act(async () => {
    root.render(
      <JobOfflineGroup
        slug="aaaaaaaa"
        alias="taucloud"
        peer={peer(fields)}
        jobs={[
          { id: "triage", label: "Support triage", valid: true, enabled: true, offline: true, project: "peer-aaaaaaaa-shop" },
          { id: "report", label: "Weekly report", valid: true, enabled: true, offline: true, project: "peer-aaaaaaaa-shop" },
        ]}
        scopeLabelFor={() => "shop"}
        zoom={1}
      />,
    );
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("JobOfflineGroup", () => {
  it("lists a dropped computer's automations under why, with a way to reconnect now", async () => {
    await show();
    expect(host.textContent).toContain("taucloud disconnected · Reconnecting…");
    expect(host.textContent).toContain("Support triage");
    expect(host.textContent).toContain("Weekly report");
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Reconnect")!.click());
    expect(bridge.PeerReconnect).toHaveBeenCalledWith("aaaaaaaa");
  });

  it("offers no reconnect for a computer turned off here", async () => {
    await show({ enabled: false });
    expect(host.textContent).toContain("taucloud is turned off on this");
    expect(host.querySelector("button")).toBeNull();
  });

  it("offers no reconnect to a computer that removed this one's access", async () => {
    await show({ lastError: "auth failed: 401 Unauthorized" });
    expect(host.textContent).toContain("taucloud no longer accepts this");
    expect(host.querySelector("button")).toBeNull();
  });
});
