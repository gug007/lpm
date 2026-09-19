import { describe, expect, it } from "vitest";
import { prefixName } from "../peer/markers";
import { adoptedProject, adoptionNotice, detectionNotice, folderBaseName, serviceNames } from "./adoptProject";

const A = "aaaaaaaa";

describe("folderBaseName", () => {
  it("takes the last path segment, ignoring a trailing slash", () => {
    expect(folderBaseName("/home/ubuntu/taucloud")).toBe("taucloud");
    expect(folderBaseName("/home/ubuntu/taucloud/")).toBe("taucloud");
    expect(folderBaseName("/")).toBe("new-project");
  });
});

describe("adoptedProject", () => {
  it("reads the name, existing flag and detected services the host answered with", () => {
    expect(adoptedProject({ name: "app-2", existing: false, services: ["web", "api"] }, "app")).toEqual({
      name: "app-2",
      existing: false,
      services: ["web", "api"],
    });
    expect(adoptedProject({ name: "app", existing: true, services: [] }, "app")).toEqual({
      name: "app",
      existing: true,
      services: [],
    });
  });

  it("falls back to the folder's name when an older host answers with nothing", () => {
    expect(adoptedProject(null, "app")).toEqual({ name: "app", existing: false, services: [] });
    expect(adoptedProject(undefined, "app")).toEqual({ name: "app", existing: false, services: [] });
  });
});

describe("serviceNames", () => {
  it("keeps only non-empty strings and tolerates anything else", () => {
    expect(serviceNames(["web", "", 3, null, "api"])).toEqual(["web", "api"]);
    expect(serviceNames(undefined)).toEqual([]);
    expect(serviceNames("web")).toEqual([]);
  });
});

describe("detectionNotice", () => {
  it("is silent for the placeholder", () => {
    expect(detectionNotice([])).toBeNull();
  });

  it("counts and lists what was found, trimming a long list", () => {
    expect(detectionNotice(["web"])).toBe("Found 1 service: web");
    expect(detectionNotice(["web", "api"])).toBe("Found 2 services: web, api");
    expect(detectionNotice(["a", "b", "c", "d", "e", "f", "g", "h"])).toBe(
      "Found 8 services: a, b, c, d, e, f and 2 more",
    );
  });
});

describe("adoptionNotice", () => {
  it("is silent when the folder landed under its own name", () => {
    expect(adoptionNotice({ name: "app", existing: false, services: [] }, "app", undefined, "")).toBeNull();
  });

  it("names the taken name and the one used instead, on the Mac it happened on", () => {
    expect(
      adoptionNotice({ name: prefixName(A, "taucloud-2"), existing: false, services: [] }, "taucloud", undefined, "taucloud"),
    ).toBe("Added as “taucloud-2” — a project named “taucloud” already exists on taucloud.");
    expect(adoptionNotice({ name: "app-2", existing: false, services: [] }, "app", undefined, "")).toBe(
      "Added as “app-2” — a project named “app” already exists.",
    );
  });

  it("points at an existing project by the label the sidebar shows", () => {
    expect(
      adoptionNotice({ name: prefixName(A, "taucloud"), existing: true, services: [] }, "taucloud", "ubuntu", "taucloud"),
    ).toBe("That folder is already the project “ubuntu” on taucloud.");
    expect(adoptionNotice({ name: "app", existing: true, services: [] }, "app", undefined, "")).toBe(
      "That folder is already the project “app”.",
    );
  });
});
