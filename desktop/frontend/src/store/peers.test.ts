import { describe, expect, it } from "vitest";
import { reducePeerFrame, isSelfOwner, type FrameMaps } from "./peers";

const empty: FrameMaps = { projectsByPeer: {}, terminalsByPeer: {}, controlByPeer: {} };

describe("reducePeerFrame", () => {
  it("stores a projects frame under its peer", () => {
    const next = reducePeerFrame(empty, "peer-1", {
      t: "projects",
      projects: [{ name: "web", label: "Web", running: true }],
    });
    expect(next.projectsByPeer["peer-1"]).toHaveLength(1);
    expect(next.projectsByPeer["peer-1"][0].name).toBe("web");
  });

  it("stores terminals keyed by peer and project", () => {
    const next = reducePeerFrame(empty, "peer-1", {
      t: "terminals",
      project: "web",
      terminals: [{ id: "web-1", label: "Claude", project: "web", cols: 80, rows: 24 }],
    });
    expect(next.terminalsByPeer["peer-1"]["web"][0].id).toBe("web-1");
  });

  it("keeps other projects' terminals when one project updates", () => {
    const seeded = reducePeerFrame(empty, "peer-1", {
      t: "terminals",
      project: "web",
      terminals: [{ id: "web-1", label: "a", project: "web", cols: 80, rows: 24 }],
    });
    const next = reducePeerFrame(seeded, "peer-1", {
      t: "terminals",
      project: "api",
      terminals: [{ id: "api-1", label: "b", project: "api", cols: 80, rows: 24 }],
    });
    expect(next.terminalsByPeer["peer-1"]["web"]).toHaveLength(1);
    expect(next.terminalsByPeer["peer-1"]["api"]).toHaveLength(1);
  });

  it("ignores the o output stream and unknown frames", () => {
    const out = reducePeerFrame(empty, "peer-1", { t: "o", id: "web-1", d: "x" });
    expect(out).toBe(empty);
    const unknown = reducePeerFrame(empty, "peer-1", { t: "status-changed" });
    expect(unknown).toBe(empty);
  });

  it("records ownership from a control frame", () => {
    const owner = { kind: "mobile", id: "peer-1", label: "Studio Mac" };
    const next = reducePeerFrame(empty, "peer-1", { t: "control", id: "web-1", owner });
    expect(next.controlByPeer["peer-1"]["web-1"]).toEqual(owner);
  });

  it("records ownership from a seed frame (owner only, data handled elsewhere)", () => {
    const owner = { kind: "window", id: "main", label: "Main window" };
    const next = reducePeerFrame(empty, "peer-1", { t: "seed", id: "web-1", data: "hi", owner });
    expect(next.controlByPeer["peer-1"]["web-1"]).toEqual(owner);
  });

  it("treats a null-owner seed as unowned", () => {
    const next = reducePeerFrame(empty, "peer-1", { t: "seed", id: "web-1", owner: null });
    expect(next.controlByPeer["peer-1"]["web-1"]).toBeNull();
  });

  it("defaults missing arrays to empty", () => {
    const next = reducePeerFrame(empty, "peer-1", { t: "projects" });
    expect(next.projectsByPeer["peer-1"]).toEqual([]);
  });
});

describe("isSelfOwner", () => {
  it("is true only for a mobile owner whose id is our device id", () => {
    expect(isSelfOwner({ kind: "mobile", id: "dev-1", label: "Mac A" }, "dev-1")).toBe(true);
  });
  it("is false for another device or a window owner", () => {
    expect(isSelfOwner({ kind: "mobile", id: "other", label: "iPhone" }, "dev-1")).toBe(false);
    expect(isSelfOwner({ kind: "window", id: "main", label: "Main" }, "dev-1")).toBe(false);
  });
  it("is false when unowned", () => {
    expect(isSelfOwner(null, "dev-1")).toBe(false);
    expect(isSelfOwner(undefined, "dev-1")).toBe(false);
  });
});
