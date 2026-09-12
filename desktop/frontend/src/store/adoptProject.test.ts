import { describe, expect, it } from "vitest";
import { prefixName } from "../peer/markers";
import { adoptedProject, adoptionNotice, folderBaseName } from "./adoptProject";

const A = "aaaaaaaa";

describe("folderBaseName", () => {
  it("takes the last path segment, ignoring a trailing slash", () => {
    expect(folderBaseName("/home/ubuntu/taucloud")).toBe("taucloud");
    expect(folderBaseName("/home/ubuntu/taucloud/")).toBe("taucloud");
    expect(folderBaseName("/")).toBe("new-project");
  });
});

describe("adoptedProject", () => {
  it("reads the name and existing flag the host answered with", () => {
    expect(adoptedProject({ name: "app-2", existing: false }, "app")).toEqual({
      name: "app-2",
      existing: false,
    });
    expect(adoptedProject({ name: "app", existing: true }, "app")).toEqual({
      name: "app",
      existing: true,
    });
  });

  it("falls back to the folder's name when an older host answers with nothing", () => {
    expect(adoptedProject(null, "app")).toEqual({ name: "app", existing: false });
    expect(adoptedProject(undefined, "app")).toEqual({ name: "app", existing: false });
  });
});

describe("adoptionNotice", () => {
  it("is silent when the folder landed under its own name", () => {
    expect(adoptionNotice({ name: "app", existing: false }, "app", undefined, "")).toBeNull();
  });

  it("names the taken name and the one used instead, on the Mac it happened on", () => {
    expect(
      adoptionNotice({ name: prefixName(A, "taucloud-2"), existing: false }, "taucloud", undefined, "taucloud"),
    ).toBe("Added as “taucloud-2” — a project named “taucloud” already exists on taucloud.");
    expect(adoptionNotice({ name: "app-2", existing: false }, "app", undefined, "")).toBe(
      "Added as “app-2” — a project named “app” already exists.",
    );
  });

  it("points at an existing project by the label the sidebar shows", () => {
    expect(
      adoptionNotice({ name: prefixName(A, "taucloud"), existing: true }, "taucloud", "ubuntu", "taucloud"),
    ).toBe("That folder is already the project “ubuntu” on taucloud.");
    expect(adoptionNotice({ name: "app", existing: true }, "app", undefined, "")).toBe(
      "That folder is already the project “app”.",
    );
  });
});
