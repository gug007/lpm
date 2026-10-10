import { describe, it, expect } from "vitest";
import {
  beginPeerStart,
  claimPeerTerminal,
  endPeerStart,
  isPeerStartInFlight,
  unclaimedHostTerminals,
} from "./hostTerminals";
import { prefixName } from "./markers";

const A = "aaaaaaaa";
const B = "bbbbbbbb";

describe("unclaimedHostTerminals", () => {
  it("lists a host terminal this Mac has no tab for", () => {
    const id = prefixName(A, "lpm-1");
    expect(unclaimedHostTerminals([{ id, label: "Claude Code", pinned: true, emoji: "🤖" }], [])).toEqual(
      [{ id, label: "Claude Code", pinned: true, emoji: "🤖" }],
    );
  });

  it("skips the tabs open here", () => {
    const open = prefixName(A, "lpm-2");
    const other = prefixName(A, "lpm-3");
    const listed = [{ id: open }, { id: other }];
    expect(unclaimedHostTerminals(listed, [open]).map((t) => t.id)).toEqual([other]);
  });

  // The host still lists a tab closed here until its stop lands.
  it("never brings back a tab that was open here once", () => {
    const id = prefixName(A, "lpm-4");
    unclaimedHostTerminals([], [id]);
    expect(unclaimedHostTerminals([{ id }], [])).toEqual([]);
  });

  it("skips a terminal this Mac started", () => {
    const id = prefixName(A, "lpm-5");
    claimPeerTerminal(id);
    expect(unclaimedHostTerminals([{ id }], [])).toEqual([]);
  });

  it("drops the host's id-as-label fallback", () => {
    const id = prefixName(A, "lpm-6");
    expect(unclaimedHostTerminals([{ id, label: "lpm-6", emoji: "" }], [])).toEqual([
      { id, label: undefined, pinned: false, emoji: undefined },
    ]);
  });

  it("ignores unmarked ids and a malformed listing", () => {
    expect(unclaimedHostTerminals([{ id: "lpm-7" }, null, "x"], [])).toEqual([]);
    expect(unclaimedHostTerminals(null, [])).toEqual([]);
  });
});

describe("peer starts in flight", () => {
  it("counts overlapping starts per host", () => {
    beginPeerStart(B);
    beginPeerStart(B);
    endPeerStart(B);
    expect(isPeerStartInFlight(B)).toBe(true);
    expect(isPeerStartInFlight(A)).toBe(false);
    endPeerStart(B);
    expect(isPeerStartInFlight(B)).toBe(false);
  });
});
