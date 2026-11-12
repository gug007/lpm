import { describe, expect, it } from "vitest";
import { crashLine, crashSummary, liveServices, pendingSummary, projectUp, serviceCrashed, serviceExitText } from "./serviceExit";
import type { ServiceInfo } from "./types";

const svc = (name: string, extra: Partial<ServiceInfo> = {}): ServiceInfo => ({
  name,
  cmd: "",
  cwd: "",
  port: 0,
  ...extra,
});

describe("serviceExit", () => {
  it("says how a service ended", () => {
    expect(serviceExitText({ exited: true, exitCode: 1 })).toBe("exited with code 1");
    expect(serviceExitText({ exited: true, exitCode: 0 })).toBe("exited");
    expect(serviceExitText({ exited: true, exitCode: null })).toBe("stopped");
  });

  it("calls only a failed exit a crash", () => {
    expect(serviceCrashed({ exited: true, exitCode: 2 })).toBe(true);
    expect(serviceCrashed({ exited: true, exitCode: 0 })).toBe(false);
    expect(serviceCrashed({ exited: true, exitCode: null })).toBe(false);
    expect(serviceCrashed({})).toBe(false);
  });

  it("counts an ended service as not running", () => {
    const project = {
      running: true,
      services: [svc("web"), svc("crashy", { exited: true, exitCode: 1 })],
    };
    expect(liveServices(project).map((s) => s.name)).toEqual(["web"]);
    expect(projectUp(project)).toBe(true);
    expect(crashSummary(project)).toBe("crashy exited with code 1");
  });

  it("treats a project whose every service ended as down", () => {
    const project = { running: true, services: [svc("job", { exited: true, exitCode: 0 })] };
    expect(projectUp(project)).toBe(false);
    expect(liveServices(project)).toEqual([]);
    expect(crashSummary(project)).toBeNull();
    expect(projectUp({ running: false, services: [] })).toBe(false);
    expect(projectUp({ running: true, services: [] })).toBe(true);
  });
});

describe("crashLine", () => {
  const svc = (name: string, exitCode?: number | null) => ({
    name,
    cmd: "",
    cwd: "",
    port: 0,
    ...(exitCode === undefined ? {} : { exited: true, exitCode }),
  });

  it("names one crash with its exit code", () => {
    expect(crashLine({ running: true, services: [svc("web", 1), svc("worker")] })).toBe("web crashed · exit 1");
  });

  it("names every crashed service", () => {
    expect(crashLine({ running: true, services: [svc("web", 1), svc("worker", 2), svc("cron", 137)] })).toBe(
      "web, worker and cron crashed",
    );
  });

  it("says nothing for a clean exit, a stop, or a stopped project", () => {
    expect(crashLine({ running: true, services: [svc("web", 0), svc("api", null)] })).toBeNull();
    expect(crashLine({ running: false, services: [svc("web", 1)] })).toBeNull();
  });
});

describe("pendingSummary", () => {
  const svc = (name: string, readiness?: "waiting" | "starting" | "notReady", exited = false) => ({
    name,
    cmd: "",
    cwd: "",
    port: 0,
    readiness,
    exited,
  });

  it("names what hasn't passed its ready check, a timed-out check first", () => {
    expect(pendingSummary({ running: true, services: [svc("api", "starting"), svc("web", "waiting")] })).toBe(
      "Starting: api, web",
    );
    expect(pendingSummary({ running: true, services: [svc("api", "starting"), svc("web", "notReady")] })).toBe(
      "Not ready: web",
    );
  });

  it("is null once everything is ready, or for an ended service or a stopped project", () => {
    expect(pendingSummary({ running: true, services: [svc("api"), svc("web", "starting", true)] })).toBeNull();
    expect(pendingSummary({ running: false, services: [svc("api", "starting")] })).toBeNull();
  });
});
