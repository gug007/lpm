import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultJobDraft, type JobDraft } from "./jobsFormat";

vi.mock("./jobsConfig", () => ({
  readJobIds: vi.fn(async () => [] as string[]),
  readGlobalJobIds: vi.fn(async () => [] as string[]),
  saveJob: vi.fn(async () => {}),
  saveJobGlobal: vi.fn(async () => {}),
  deleteJob: vi.fn(async () => {}),
  deleteJobGlobal: vi.fn(async () => {}),
}));

import {
  deleteJob,
  deleteJobGlobal,
  readGlobalJobIds,
  readJobIds,
  saveJob,
  saveJobGlobal,
} from "./jobsConfig";
import { saveJobDraft, scopeProject } from "./jobsSave";

function draftWith(scope: Partial<JobDraft>): JobDraft {
  return { ...defaultJobDraft(), label: "Nightly", cmd: "make", runMode: "cmd", ...scope };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readJobIds).mockResolvedValue([]);
  vi.mocked(readGlobalJobIds).mockResolvedValue([]);
});

describe("scopeProject", () => {
  it("is the one picked project, and nothing wider", () => {
    expect(scopeProject(draftWith({ targets: ["api"] }))).toBe("api");
    expect(scopeProject(draftWith({ targets: ["api", "web"] }))).toBeUndefined();
    expect(scopeProject(draftWith({ targets: [] }))).toBeUndefined();
    expect(
      scopeProject(draftWith({ targets: ["api"], everyProject: true })),
    ).toBeUndefined();
  });
});

describe("saveJobDraft", () => {
  it("writes a one-project job into that project's config", async () => {
    const id = await saveJobDraft(draftWith({ targets: ["api"] }), null, []);
    expect(id).toBe("nightly");
    expect(saveJob).toHaveBeenCalledWith("api", "nightly", expect.anything());
    expect(saveJobGlobal).not.toHaveBeenCalled();
  });

  it("writes a multi-project job to the shared layer with its targets", async () => {
    await saveJobDraft(draftWith({ targets: ["api", "web"] }), null, []);
    expect(saveJobGlobal).toHaveBeenCalledWith(
      "nightly",
      expect.objectContaining({ projects: ["api", "web"] }),
    );
  });

  it("keeps a standalone job's empty target list", async () => {
    await saveJobDraft(draftWith({ targets: [] }), null, []);
    expect(saveJobGlobal).toHaveBeenCalledWith(
      "nightly",
      expect.objectContaining({ projects: [] }),
    );
  });

  it("omits the target list for an every-project job", async () => {
    await saveJobDraft(draftWith({ everyProject: true }), null, []);
    const payload = vi.mocked(saveJobGlobal).mock.calls[0][1];
    expect("projects" in payload).toBe(false);
  });

  it("avoids an id another visible job already uses", async () => {
    vi.mocked(readJobIds).mockResolvedValue(["nightly"]);
    const id = await saveJobDraft(draftWith({ targets: ["api"] }), null, []);
    expect(id).toBe("nightly-2");
  });

  it("saves an unchanged scope in place, without touching another layer", async () => {
    const editing = { project: "api", id: "nightly", source: "project" as const };
    await saveJobDraft(draftWith({ targets: ["api"] }), editing, ["nightly"]);
    expect(saveJob).toHaveBeenCalledWith("api", "nightly", expect.anything());
    expect(readJobIds).not.toHaveBeenCalled();
    expect(deleteJob).not.toHaveBeenCalled();
    expect(deleteJobGlobal).not.toHaveBeenCalled();
  });

  it("moves a job to the project it now runs in", async () => {
    const editing = { project: "api", id: "nightly", source: "project" as const };
    await saveJobDraft(draftWith({ targets: ["web"] }), editing, ["nightly"]);
    expect(saveJob).toHaveBeenCalledWith("web", "nightly", expect.anything());
    expect(deleteJob).toHaveBeenCalledWith("api", "nightly");
  });

  it("renames a moving job whose id the destination already uses", async () => {
    vi.mocked(readJobIds).mockResolvedValue(["nightly"]);
    const editing = { project: "api", id: "nightly", source: "project" as const };
    const id = await saveJobDraft(draftWith({ targets: ["web"] }), editing, []);
    expect(id).toBe("nightly-2");
    expect(saveJob).toHaveBeenCalledWith("web", "nightly-2", expect.anything());
    expect(deleteJob).toHaveBeenCalledWith("api", "nightly");
  });

  it("moves a widened job out of its project and into the shared layer", async () => {
    const editing = { project: "api", id: "nightly", source: "project" as const };
    await saveJobDraft(draftWith({ targets: ["api", "web"] }), editing, ["nightly"]);
    expect(saveJobGlobal).toHaveBeenCalledWith(
      "nightly",
      expect.objectContaining({ projects: ["api", "web"] }),
    );
    expect(deleteJob).toHaveBeenCalledWith("api", "nightly");
  });

  it("moves a narrowed shared job into the one project left", async () => {
    const editing = { project: "api", id: "nightly", source: "global" as const };
    await saveJobDraft(draftWith({ targets: ["api"] }), editing, ["nightly"]);
    expect(saveJob).toHaveBeenCalledWith("api", "nightly", expect.anything());
    expect(deleteJobGlobal).toHaveBeenCalledWith("nightly");
    expect(deleteJob).not.toHaveBeenCalled();
  });

  it("keeps a shared job shared when its scope stays wide", async () => {
    const editing = { project: "api", id: "nightly", source: "global" as const };
    await saveJobDraft(draftWith({ everyProject: true }), editing, ["nightly"]);
    expect(saveJobGlobal).toHaveBeenCalledWith("nightly", expect.anything());
    expect(deleteJob).not.toHaveBeenCalled();
    expect(deleteJobGlobal).not.toHaveBeenCalled();
  });
});
