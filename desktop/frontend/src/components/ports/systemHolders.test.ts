import { describe, expect, it } from "vitest";
import type { ListeningPort } from "./portsModel";
import { systemHolder } from "./systemHolders";

const port = (over: Partial<ListeningPort>): ListeningPort => ({
  port: 7000,
  pid: 491,
  process: "ControlCenter",
  project: "",
  projectLabel: "",
  parent: "",
  service: "",
  terminal: "",
  own: false,
  startedAt: 0,
  machine: "local",
  machineName: "Mac",
  ...over,
});

describe("systemHolder", () => {
  it("names macOS's AirPlay Receiver and says how to free the port", () => {
    const holder = systemHolder(port({}));
    expect(holder?.label).toBe("macOS · AirPlay Receiver");
    expect(holder?.fix?.(7000)).toContain(":7000");
  });

  it("knows nothing of an ordinary process", () => {
    expect(systemHolder(port({ process: "node" }))).toBeNull();
  });

  it("leaves a process lpm started alone, whatever it is called", () => {
    expect(systemHolder(port({ project: "app", service: "web" }))).toBeNull();
    expect(systemHolder(port({ own: true }))).toBeNull();
  });
});
