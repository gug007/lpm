import { describe, it, expect } from "vitest";
import type { ProjectInfo } from "../types";
import {
  findAgreedSlug,
  stripArgs,
  translateResult,
  mergeProjectLists,
  translatePeerEventPayload,
  isLocalOnlyCommand,
} from "./router";
import { prefixName, prefixRoot } from "./markers";

const A = "aaaaaaaa";
const B = "bbbbbbbb";

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    name: "p",
    session: "",
    root: "/root",
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    ...over,
  };
}

describe("findAgreedSlug", () => {
  it("returns null when no argument is marked", () => {
    expect(findAgreedSlug({ name: "local", cwd: "/x" })).toBeNull();
    expect(findAgreedSlug(undefined)).toBeNull();
  });

  it("finds the slug from a marked name or root", () => {
    expect(findAgreedSlug({ projectName: prefixName(A, "app") })).toBe(A);
    expect(findAgreedSlug({ cwd: prefixRoot(A, "/Users/dev/app") })).toBe(A);
  });

  it("scans one array level deep", () => {
    expect(findAgreedSlug({ names: [prefixName(A, "one"), prefixName(A, "two")] })).toBe(A);
  });

  it("throws when two arguments disagree on the peer", () => {
    expect(() => findAgreedSlug({ id: prefixName(A, "t"), cwd: prefixRoot(B, "/p") })).toThrow();
  });
});

describe("stripArgs", () => {
  it("strips markers from strings and arrays, leaving others intact", () => {
    const stripped = stripArgs({
      id: prefixName(A, "app-0"),
      cwd: prefixRoot(A, "/Users/dev/app"),
      data: "echo hi",
      names: [prefixName(A, "one"), "plain"],
      count: 3,
    });
    expect(stripped).toEqual({
      id: "app-0",
      cwd: "/Users/dev/app",
      data: "echo hi",
      names: ["one", "plain"],
      count: 3,
    });
  });
});

describe("translateResult", () => {
  it("prefixes name, parentName, and root for list_projects", () => {
    const result = translateResult("list_projects", A, [
      proj({ name: "app", root: "/Users/dev/app" }),
      proj({ name: "app-1", parentName: "app", root: "/Users/dev/app-1" }),
    ]) as ProjectInfo[];
    expect(result[0].name).toBe(prefixName(A, "app"));
    expect(result[0].root).toBe(prefixRoot(A, "/Users/dev/app"));
    expect(result[1].parentName).toBe(prefixName(A, "app"));
    expect(result[1].root).toBe(prefixRoot(A, "/Users/dev/app-1"));
  });

  it("translates a single project for get_project", () => {
    const result = translateResult("get_project", A, proj({ name: "app", root: "/r" })) as ProjectInfo;
    expect(result.name).toBe(prefixName(A, "app"));
    expect(result.root).toBe(prefixRoot(A, "/r"));
  });

  it("prefixes the new name(s) returned by duplicate commands", () => {
    expect(translateResult("duplicate_project", A, "app-copy-1")).toBe(prefixName(A, "app-copy-1"));
    expect(translateResult("start_duplicate_project", A, "app-copy-1")).toBe(
      prefixName(A, "app-copy-1"),
    );
    expect(translateResult("duplicate_projects", A, ["app-1", "app-2"])).toEqual([
      prefixName(A, "app-1"),
      prefixName(A, "app-2"),
    ]);
  });

  it("passes other results through unchanged", () => {
    expect(translateResult("git_status", A, { clean: true })).toEqual({ clean: true });
    // start_terminal ids are prefixed by the route wiring, not the pure table.
    expect(translateResult("start_terminal", A, "app-0")).toBe("app-0");
  });
});

describe("mergeProjectLists", () => {
  it("appends each peer list after the local list", () => {
    const local = [proj({ name: "local" })];
    const peer = [proj({ name: prefixName(A, "remote") })];
    expect(mergeProjectLists(local, [peer]).map((p) => p.name)).toEqual([
      "local",
      prefixName(A, "remote"),
    ]);
    expect(mergeProjectLists(local, []).map((p) => p.name)).toEqual(["local"]);
  });
});

describe("translatePeerEventPayload", () => {
  it("prefixes the project name for status-changed and ports-changed", () => {
    expect(translatePeerEventPayload("status-changed", A, "app")).toBe(prefixName(A, "app"));
    expect(translatePeerEventPayload("ports-changed", A, "app")).toBe(prefixName(A, "app"));
  });

  it("prefixes the project root for git-changed and keeps files", () => {
    const out = translatePeerEventPayload("git-changed", A, {
      path: "/Users/dev/app",
      files: ["a.ts"],
    });
    expect(out).toEqual({ path: prefixRoot(A, "/Users/dev/app"), files: ["a.ts"] });
  });

  it("passes identifier-free payloads through", () => {
    expect(translatePeerEventPayload("projects-changed", A, null)).toBeNull();
    expect(translatePeerEventPayload("action-output", A, { line: "x" })).toEqual({ line: "x" });
  });

  it("prefixes the project name for clone-done and keeps ok/error", () => {
    expect(translatePeerEventPayload("clone-done", A, { name: "app", ok: true, error: null })).toEqual(
      { name: prefixName(A, "app"), ok: true, error: null },
    );
    expect(
      translatePeerEventPayload("clone-done", A, { name: "app", ok: false, error: "boom" }),
    ).toEqual({ name: prefixName(A, "app"), ok: false, error: "boom" });
  });

  it("leaves a malformed clone-done payload untouched", () => {
    expect(translatePeerEventPayload("clone-done", A, { ok: true })).toEqual({ ok: true });
  });

  it("prefixes the project name for duplicate-done and keeps ok/error", () => {
    expect(
      translatePeerEventPayload("duplicate-done", A, { name: "app-copy-1", ok: true, error: null }),
    ).toEqual({ name: prefixName(A, "app-copy-1"), ok: true, error: null });
    expect(
      translatePeerEventPayload("duplicate-done", A, { name: "app-copy-1", ok: false, error: "boom" }),
    ).toEqual({ name: prefixName(A, "app-copy-1"), ok: false, error: "boom" });
  });

  it("leaves a malformed duplicate-done payload untouched", () => {
    expect(translatePeerEventPayload("duplicate-done", A, { ok: true })).toEqual({ ok: true });
  });
});

describe("isLocalOnlyCommand", () => {
  it("never routes peer/remote transport or app-meta commands", () => {
    expect(isLocalOnlyCommand("peer_invoke")).toBe(true);
    expect(isLocalOnlyCommand("peer_term_attach")).toBe(true);
    expect(isLocalOnlyCommand("remote_state")).toBe(true);
    expect(isLocalOnlyCommand("save_settings")).toBe(true);
    expect(isLocalOnlyCommand("install_update")).toBe(true);
  });

  it("keeps terminal control ownership local even for a peer-prefixed id", () => {
    expect(isLocalOnlyCommand("terminal_claim_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_present_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_unpresent_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_control_owner")).toBe(true);
  });

  it("routes project-scoped commands", () => {
    expect(isLocalOnlyCommand("git_status")).toBe(false);
    expect(isLocalOnlyCommand("write_terminal")).toBe(false);
    expect(isLocalOnlyCommand("start_terminal")).toBe(false);
  });
});
