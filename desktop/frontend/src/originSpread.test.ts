import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OriginStatus } from "./originStatus";

const KEY = "github.com/me/web#refs/heads/main";
const OLD = "1111111";
const NEW = "2222222";

const mocks = vi.hoisted(() => ({
  off: new Set<string>(),
  // What origin holds now: a fetch brings a root's upstream to it.
  originSha: "2222222",
  calls: [] as string[],
}));

vi.mock("./autoPullRun", () => ({
  autoPullProject: (root: string) => (mocks.off.has(root) ? undefined : { root }),
  maybeAutoPull: vi.fn(async (root: string) => {
    mocks.calls.push(`pull ${root}`);
  }),
}));
vi.mock("./originActions", () => ({
  recheckOrigin: vi.fn(async (root: string, fetch = false) => {
    mocks.calls.push(`${fetch ? "fetch" : "recount"} ${root}`);
    if (!fetch) return;
    const { useOriginStatus } = await import("./store/originStatus");
    const current = useOriginStatus.getState().entries[root]?.status;
    if (current) useOriginStatus.getState().setStatus(root, { ...current, upstreamSha: mocks.originSha });
  }),
}));

type Spread = typeof import("./originSpread");
type Origin = typeof import("./store/originStatus");
let spread: Spread;
let useOriginStatus: Origin["useOriginStatus"];
let stop: () => void;

const status = (patch: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 0,
  base: "",
  baseBehind: 0,
  conflicted: false,
  changes: 0,
  fetched: true,
  upstreamKey: KEY,
  upstreamSha: OLD,
  ...patch,
});

const PEER_1 = "/@peer-aabbccdd/Users/g/web";
const PEER_2 = "/@peer-aabbccdd/Users/g/web-2";
const OTHER_PEER = "/@peer-11223344/Users/g/web";

function seed(roots: Record<string, Partial<OriginStatus>>) {
  for (const [root, patch] of Object.entries(roots)) useOriginStatus.getState().setStatus(root, status(patch));
}

// The copy at `root` sees origin move: its push or fetch landed.
function moves(root: string, sha = NEW) {
  const current = useOriginStatus.getState().entries[root].status;
  useOriginStatus.getState().setStatus(root, { ...current, upstreamSha: sha });
}

const settled = () => vi.waitFor(() => expect(mocks.calls.at(-1)?.startsWith("pull")).toBe(true));
const fetches = () => mocks.calls.filter((c) => c.startsWith("fetch"));

beforeEach(async () => {
  vi.resetModules();
  spread = await import("./originSpread");
  ({ useOriginStatus } = await import("./store/originStatus"));
  mocks.off.clear();
  mocks.originSha = NEW;
  mocks.calls = [];
  useOriginStatus.getState().reset();
  stop = spread.followOriginMoves();
});

afterEach(() => stop());

describe("originMoved", () => {
  it("is a new commit on the same repository and branch", () => {
    expect(spread.originMoved(status(), status({ upstreamSha: NEW }))).toBe(true);
    expect(spread.originMoved(status(), status())).toBe(false);
    expect(spread.originMoved(undefined, status())).toBe(false);
    expect(spread.originMoved(status(), status({ upstreamKey: "github.com/me/web#refs/heads/dev", upstreamSha: NEW }))).toBe(false);
    expect(spread.originMoved(status({ upstreamSha: undefined }), status())).toBe(false);
    expect(spread.originMoved(status(), status({ upstreamKey: "", upstreamSha: "" }))).toBe(false);
  });
});

describe("copiesToFetch", () => {
  it("takes this Mac's copies that could fast-forward, and one copy per paired Mac not reached yet", () => {
    seed({
      "/p/a": { upstreamSha: NEW },
      "/p/b": {},
      "/p/c": { upstreamSha: NEW },
      "/p/api": { upstreamKey: "github.com/me/api#refs/heads/main" },
      "/p/ahead": { ahead: 1 },
      "/p/stuck": { conflicted: true },
      [PEER_1]: {},
      [PEER_2]: {},
      [OTHER_PEER]: {},
    });
    const entries = useOriginStatus.getState().entries;
    expect(spread.copiesToFetch("/p/a", entries["/p/a"].status, entries)).toEqual(["/p/b", PEER_1, OTHER_PEER]);
  });

  it("leaves a paired Mac alone once one of its copies has the commit, or it came from there", () => {
    seed({ "/p/a": {}, [PEER_1]: { upstreamSha: NEW }, [PEER_2]: {}, [OTHER_PEER]: {} });
    const entries = useOriginStatus.getState().entries;
    expect(spread.copiesToFetch(PEER_1, entries[PEER_1].status, entries)).toEqual(["/p/a", OTHER_PEER]);
  });
});

describe("followOriginMoves", () => {
  it("fetches each copy behind a push, one at a time, then offers the pull", async () => {
    seed({ "/p/a": {}, "/p/b": {}, "/p/c": {}, "/p/api": { upstreamKey: "github.com/me/api#refs/heads/main" } });
    moves("/p/a");
    await vi.waitFor(() => expect(mocks.calls).toHaveLength(4));
    expect(mocks.calls).toEqual(["fetch /p/b", "pull /p/b", "fetch /p/c", "pull /p/c"]);
  });

  it("fetches each copy once for a burst of pushes, and a fetched copy moving starts nothing new", async () => {
    seed({ "/p/a": {}, "/p/b": {}, "/p/c": {} });
    moves("/p/a", "3333333");
    moves("/p/a", NEW);
    await vi.waitFor(() => expect(fetches()).toHaveLength(2));
    await settled();
    expect(fetches()).toEqual(["fetch /p/b", "fetch /p/c"]);
  });

  it("leaves copies auto pull wouldn't act on to their next round", async () => {
    seed({ "/p/a": {}, "/p/b": {}, "/p/c": {} });
    mocks.off.add("/p/b");
    moves("/p/a");
    await settled();
    expect(fetches()).toEqual(["fetch /p/c"]);
  });

  it("fetches one copy on a paired Mac and leaves the rest to that Mac", async () => {
    seed({ "/p/a": {}, [PEER_1]: {}, [PEER_2]: {} });
    moves("/p/a");
    await settled();
    expect(mocks.calls).toEqual([`fetch ${PEER_1}`, `pull ${PEER_1}`]);
  });

  it("does nothing once stopped", () => {
    seed({ "/p/a": {}, "/p/b": {} });
    stop();
    moves("/p/a");
    expect(mocks.calls).toEqual([]);
  });
});
