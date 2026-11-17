import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({
  ArchivePreview: vi.fn(),
  ListArchivedProjects: vi.fn(),
  ProjectDiskSize: vi.fn(),
  ProjectSizeBreakdown: vi.fn(),
}));

import { ListArchivedProjects, ProjectDiskSize, ProjectSizeBreakdown } from "../bridge/commands";
import {
  archiveLocation,
  archiveSummary,
  listArchived,
  matchesArchived,
  projectSize,
  rebuildableBytes,
  rebuildableKinds,
  sortArchived,
  toArchived,
  type ArchivedProject,
} from "./projectArchive";

const entry = (over: Partial<ArchivedProject>): ArchivedProject => ({
  name: "api",
  label: "api",
  root: "/Users/me/Projects/api",
  isRemote: false,
  archivedAt: 1,
  copies: 0,
  automations: 0,
  machine: "",
  ...over,
});

describe("toArchived", () => {
  it("reads an entry and falls back to the name for a missing label", () => {
    expect(toArchived({ name: "api", root: "/p/api", archivedAt: 5, copies: 2 }, "")).toEqual(
      entry({ root: "/p/api", archivedAt: 5, copies: 2 }),
    );
    expect(toArchived({ label: "nameless" }, "")).toBeNull();
    expect(toArchived(null, "")).toBeNull();
  });

  it("marks a paired machine's project so later calls reach it", () => {
    const p = toArchived({ name: "api", label: "API" }, "0123abcd");
    expect(p?.name).toBe("peer-0123abcd-api");
    expect(p?.label).toBe("API");
    expect(p?.machine).toBe("0123abcd");
  });
});

describe("listArchived", () => {
  it("asks this machine with no marker and a paired one with its own", async () => {
    vi.mocked(ListArchivedProjects).mockResolvedValue([{ name: "api" }, { bogus: true }]);
    expect((await listArchived()).map((p) => p.name)).toEqual(["api"]);
    expect(ListArchivedProjects).toHaveBeenLastCalledWith("");
    await listArchived("0123abcd");
    expect(ListArchivedProjects).toHaveBeenLastCalledWith("peer-0123abcd-");
  });
});

describe("archiveLocation", () => {
  it("names More until the user moves Archive into the sidebar", () => {
    expect(archiveLocation(["terminals"])).toBe("More › Archive");
    expect(archiveLocation(["terminals", "archive"])).toBe("Archive in the sidebar");
  });
});

describe("sortArchived", () => {
  const list = [
    entry({ name: "b", label: "beta", archivedAt: 3 }),
    entry({ name: "a", label: "Alpha", archivedAt: 1 }),
    entry({ name: "c", label: "gamma", archivedAt: 2 }),
  ];
  const names = (l: ArchivedProject[]) => l.map((p) => p.name);

  it("puts the newest first, or sorts by name", () => {
    expect(names(sortArchived(list, "archived", new Map()))).toEqual(["b", "c", "a"]);
    expect(names(sortArchived(list, "name", new Map()))).toEqual(["a", "b", "c"]);
  });

  it("puts the biggest first and what isn't measured last", () => {
    const sizes = new Map([
      ["a", { bytes: 10, rebuildable: [] }],
      ["b", null],
      ["c", { bytes: 300, rebuildable: [] }],
    ]);
    expect(names(sortArchived(list, "size", sizes))).toEqual(["c", "a", "b"]);
  });
});

describe("matchesArchived and archiveSummary", () => {
  it("matches the label, the name or the folder", () => {
    const p = entry({ name: "peer-0123abcd-api", label: "Billing", root: "/@peer-0123abcd/srv/billing" });
    expect(matchesArchived(p, "bill")).toBe(true);
    expect(matchesArchived(p, "SRV")).toBe(true);
    expect(matchesArchived(p, "web")).toBe(false);
    expect(matchesArchived(p, "  ")).toBe(true);
  });

  it("counts projects and paused automations", () => {
    expect(archiveSummary([entry({ automations: 2 }), entry({ name: "b" })])).toBe(
      "2 projects · 2 automations paused",
    );
    expect(archiveSummary([entry({})])).toBe("1 project");
  });
});

describe("projectSize", () => {
  it("reads the breakdown and drops folders with nothing in them", async () => {
    vi.mocked(ProjectSizeBreakdown).mockResolvedValue({
      bytes: 500,
      rebuildable: [{ path: "node_modules", bytes: 300 }, { path: "dist", bytes: 0 }, { bogus: 1 }],
    });
    expect(await projectSize("api")).toEqual({ bytes: 500, rebuildable: [{ path: "node_modules", bytes: 300 }] });
    vi.mocked(ProjectSizeBreakdown).mockResolvedValue(null);
    expect(await projectSize("ssh")).toBeNull();
  });

  it("falls back to the plain size on a machine that can't break it down", async () => {
    vi.mocked(ProjectSizeBreakdown).mockRejectedValue(new Error("unknown command"));
    vi.mocked(ProjectDiskSize).mockResolvedValue(42);
    expect(await projectSize("peer-0123abcd-api")).toEqual({ bytes: 42, rebuildable: [] });
  });
});

describe("rebuildable folders", () => {
  const web = { bytes: 900, rebuildable: [{ path: "node_modules", bytes: 400 }, { path: "packages/ui/node_modules", bytes: 100 }, { path: ".next", bytes: 50 }] };
  const cli = { bytes: 600, rebuildable: [{ path: "target", bytes: 520 }] };

  it("adds up what can be rebuilt", () => {
    expect(rebuildableBytes(web)).toBe(550);
    expect(rebuildableBytes(null)).toBe(0);
    expect(rebuildableBytes(undefined)).toBe(0);
  });

  it("sums folders by their own name, biggest first", () => {
    expect(rebuildableKinds([web, cli, null])).toEqual([
      { path: "target", bytes: 520 },
      { path: "node_modules", bytes: 500 },
      { path: ".next", bytes: 50 },
    ]);
  });
});
