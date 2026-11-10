import { describe, expect, it } from "vitest";
import { foldSteps, liveParts, runningRunAsks, stepsLabel } from "./jobLive";
import type { JobAsk } from "./jobAsk";

const ask = (fields: Partial<JobAsk>): JobAsk => ({
  id: "q",
  askedAt: 1,
  status: "open",
  questions: [{ id: "a", type: "confirm", text: "Send it?" }],
  ...fields,
});

describe("liveParts", () => {
  it("splits what the agent said from the steps it took", () => {
    expect(liveParts("Looking at the chats.\n→ Bash\n→ Read\nFound one.\nIt asks for a refund.\n→ Bash")).toEqual([
      { kind: "text", text: "Looking at the chats." },
      { kind: "steps", names: ["Bash", "Read"] },
      { kind: "text", text: "Found one.\nIt asks for a refund." },
      { kind: "steps", names: ["Bash"] },
    ]);
    expect(liveParts("")).toEqual([]);
  });
});

describe("stepsLabel and foldSteps", () => {
  it("names each tool once, in the order first used, with its count", () => {
    expect(stepsLabel(["Skill", "Bash", "Read", "Bash", "Bash"])).toBe("Skill, Bash ×3, Read");
    expect(foldSteps("Hi.\n→ Bash\n→ Bash\nDone.")).toBe("Hi.\n→ Bash ×2\nDone.");
  });
});

describe("runningRunAsks", () => {
  it("keeps the questions the run still going asked", () => {
    const own = ask({ id: "own" });
    const earlier = ask({ id: "earlier", at: 100 });
    const keyed = ask({ id: "keyed", key: "chat-482" });
    const elsewhere = ask({ id: "elsewhere", project: "blog" });
    expect(runningRunAsks({ running: true, asks: [own, earlier, keyed, elsewhere] }, "shop")).toEqual([own]);
    expect(runningRunAsks({ running: false, asks: [own] }, "shop")).toEqual([]);
    expect(runningRunAsks({ running: true, ask: own }, "shop")).toEqual([own]);
  });
});
