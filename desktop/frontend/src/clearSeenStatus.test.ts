import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSeenStatus } from "./clearSeenStatus";

const h = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("../bridge/commands", () => ({ ClearStatus: h.clear }));

const project = "peer-abcd1234-docs";

beforeEach(() => {
  h.clear.mockReset();
});

describe("clearSeenStatus", () => {
  it("settles when the paired computer doesn't answer, and asks again on the next touch", async () => {
    h.clear.mockRejectedValueOnce("peer request timed out").mockResolvedValue(undefined);
    await expect(clearSeenStatus(project, "t1", "Done")).resolves.toBeUndefined();
    await clearSeenStatus(project, "t1", "Done");
    expect(h.clear.mock.calls).toEqual([
      [project, "t1", "Done"],
      [project, "t1", "Done"],
    ]);
  });

  it("keeps one call open per status however often the tab is touched", async () => {
    h.clear.mockReturnValue(new Promise(() => {}));
    void clearSeenStatus(project, "t2", "Done");
    for (let i = 0; i < 100; i++) await clearSeenStatus(project, "t2", "Done");
    expect(h.clear).toHaveBeenCalledTimes(1);

    void clearSeenStatus(project, "t2", "Error");
    void clearSeenStatus(project, "t3", "Done");
    expect(h.clear).toHaveBeenCalledTimes(3);
  });
});
