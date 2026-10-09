import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({
  AcceptClaudePoolPick: vi.fn(),
  ClaudePoolState: vi.fn(),
  ResumeClaudePool: vi.fn(),
  SetClaudePool: vi.fn(),
  LoadClaudeAccounts: vi.fn(async () => ({ accounts: [] })),
  SaveClaudeAccounts: vi.fn(),
  RemoveClaudeAccount: vi.fn(),
  ClaudeAccountsStatus: vi.fn(async () => ({ statuses: [] })),
  ClaudeAccountUsage: vi.fn(async () => ({ usage: {} })),
}));
vi.mock("../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
}));

import { projectAccount, projectPool } from "./claudeProjectPool";
import type { ClaudePool, PoolView } from "./store/claudePool";
import type { ProjectInfo } from "./types";

const MAIN: PoolView = { key: "__main__", project: null, members: ["default", "work"], current: "work", pick: null };
const API: PoolView = { key: "project:api", project: "api", members: ["side", "home"], current: "side", pick: null };
const pool = { active: true, pools: [MAIN, API] } as unknown as ClaudePool;

function project(fields: Partial<ProjectInfo>): ProjectInfo {
  return { name: "api", isRemote: false, ...fields } as ProjectInfo;
}

describe("projectPool", () => {
  it("has no pool for a pinned project", () => {
    expect(projectPool(project({ claudeAccount: "work", claudeAccounts: ["side"] }), [], pool)).toBeUndefined();
    expect(projectPool(project({ claudeAccount: "" }), [], pool)).toBeUndefined();
  });

  it("uses the project's own list", () => {
    expect(projectPool(project({ claudeAccounts: ["side", "home"] }), [], pool)).toBe(API);
  });

  it("uses the main accounts with no keys or an empty list", () => {
    expect(projectPool(project({ name: "web" }), [], pool)).toBe(MAIN);
    expect(projectPool(project({ name: "web", claudeAccounts: [] }), [], pool)).toBe(MAIN);
  });

  it("follows the parent's list on a copy with no keys of its own", () => {
    const parent = project({ claudeAccounts: ["side", "home"] });
    const copy = project({ name: "api-2", parentName: "api" });
    expect(projectPool(copy, [parent, copy], pool)).toBe(API);
  });

  it("falls back to the main accounts when a list has no pool", () => {
    expect(projectPool(project({ name: "web", claudeAccounts: ["gone"] }), [], pool)).toBe(MAIN);
  });
});

describe("projectAccount", () => {
  const registered = ["work", "side", "home"];

  it("uses a pin to a registered account, else the main login", () => {
    expect(projectAccount(project({ claudeAccount: "home" }), [], pool, registered)).toBe("home");
    expect(projectAccount(project({ claudeAccount: "" }), [], pool, registered)).toBe("default");
    expect(projectAccount(project({ claudeAccount: "gone" }), [], pool, registered)).toBe("default");
  });

  it("uses the pool's current account", () => {
    expect(projectAccount(project({ claudeAccounts: ["side", "home"] }), [], pool, registered)).toBe("side");
    expect(projectAccount(project({ name: "web" }), [], pool, registered)).toBe("work");
  });

  it("leaves lpm's own login to the backend", () => {
    const idle = { active: false, pools: [{ ...MAIN, current: null }] } as unknown as ClaudePool;
    expect(projectAccount(project({ name: "web" }), [], idle, registered)).toBeNull();
    expect(projectAccount(project({ name: "web" }), [], null, registered)).toBeNull();
  });
});
