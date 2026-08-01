import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RETAIN_MS,
  MAX_RETAINED,
  RECLAIM_WINDOW_MS,
  isPeerSessionRetained,
  publishPeerSnapshot,
  reclaimPeerSession,
  retainPeerSession,
} from "./retainedSessions";

const SLUG = "a1b2c3d4";
const TERM = `peer-${SLUG}-term-1`;

describe("retainedSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Drop anything a previous test left retained (an empty snapshot means every
    // peer is unpaired), then start from a known snapshot-less state.
    publishPeerSnapshot([]);
  });

  afterEach(() => {
    publishPeerSnapshot([]);
    vi.useRealTimers();
  });

  it("does not retain a local terminal", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    expect(retainPeerSession("term-42", vi.fn())).toBe(false);
  });

  it("does not retain before peer state is known", () => {
    expect(retainPeerSession(TERM, vi.fn())).toBe(false);
    expect(isPeerSessionRetained(TERM)).toBe(false);
  });

  it("does not retain a terminal whose peer is no longer paired", () => {
    publishPeerSnapshot([{ slug: "ffffffff", connected: true }]);
    expect(retainPeerSession(TERM, vi.fn())).toBe(false);
  });

  it("retains a terminal while its peer is merely disconnected", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    expect(retainPeerSession(TERM, dispose)).toBe(true);
    // The reclaim clock doesn't run while the peer is unreachable.
    vi.advanceTimersByTime(RECLAIM_WINDOW_MS * 2);
    expect(dispose).not.toHaveBeenCalled();
    expect(isPeerSessionRetained(TERM)).toBe(true);
  });

  it("hands the session back on reclaim and stops all teardown", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    reclaimPeerSession(TERM);
    expect(isPeerSessionRetained(TERM)).toBe(false);
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    vi.advanceTimersByTime(MAX_RETAIN_MS * 2);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("reclaiming an unretained terminal is a no-op", () => {
    expect(() => reclaimPeerSession(TERM)).not.toThrow();
  });

  it("disposes when the peer never comes back", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    vi.advanceTimersByTime(MAX_RETAIN_MS - 1);
    expect(dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(isPeerSessionRetained(TERM)).toBe(false);
  });

  it("disposes at once when the peer is unpaired", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    publishPeerSnapshot([]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(isPeerSessionRetained(TERM)).toBe(false);
  });

  it("disposes when the peer is back but nothing reclaims the session", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    vi.advanceTimersByTime(RECLAIM_WINDOW_MS - 1);
    expect(dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("retains a session unmounted while its peer is already connected", () => {
    // A project removed on a reachable host: retained, but only for the reclaim
    // window, since nothing will ever mount it again.
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    const dispose = vi.fn();
    expect(retainPeerSession(TERM, dispose)).toBe(true);
    vi.advanceTimersByTime(RECLAIM_WINDOW_MS);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("restarts the reclaim window across a flapping peer", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    vi.advanceTimersByTime(RECLAIM_WINDOW_MS - 1);
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    vi.advanceTimersByTime(RECLAIM_WINDOW_MS - 1);
    expect(dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the hard cap while a peer flaps", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const dispose = vi.fn();
    retainPeerSession(TERM, dispose);
    // Reconnect briefly every half reclaim window: the reclaim clock keeps being
    // rearmed, so only the hard cap can end this.
    for (let elapsed = 0; elapsed < MAX_RETAIN_MS; elapsed += RECLAIM_WINDOW_MS / 2) {
      publishPeerSnapshot([{ slug: SLUG, connected: true }]);
      vi.advanceTimersByTime(RECLAIM_WINDOW_MS / 4);
      publishPeerSnapshot([{ slug: SLUG, connected: false }]);
      vi.advanceTimersByTime(RECLAIM_WINDOW_MS / 4);
    }
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the first retention when a terminal is retained twice", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const first = vi.fn();
    const second = vi.fn();
    retainPeerSession(TERM, first);
    expect(retainPeerSession(TERM, second)).toBe(true);
    vi.advanceTimersByTime(MAX_RETAIN_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  // Retention fires on ordinary navigation too (the drop isn't known yet at
  // unmount), so a burst of project switching must not pile up emulators for a
  // whole reclaim window.
  it("caps how many sessions a reachable peer can hold at once", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: true }]);
    const disposes = Array.from({ length: MAX_RETAINED + 3 }, () => vi.fn());
    disposes.forEach((dispose, i) => {
      retainPeerSession(`peer-${SLUG}-term-${i}`, dispose);
    });
    // The three oldest went to make room; nothing newer was touched.
    for (let i = 0; i < 3; i++) {
      expect(disposes[i]).toHaveBeenCalledTimes(1);
      expect(isPeerSessionRetained(`peer-${SLUG}-term-${i}`)).toBe(false);
    }
    for (let i = 3; i < disposes.length; i++) {
      expect(disposes[i]).not.toHaveBeenCalled();
    }
  });

  // The cap must not spend a dropped peer's sessions — the ones retention exists
  // for — on terminals merely navigated away from.
  it("gives up navigated-away sessions before ones waiting out a drop", () => {
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    const waiting = vi.fn();
    retainPeerSession(TERM, waiting);
    publishPeerSnapshot([
      { slug: SLUG, connected: false },
      { slug: "99887766", connected: true },
    ]);
    const browsed = Array.from({ length: MAX_RETAINED }, () => vi.fn());
    browsed.forEach((dispose, i) => {
      retainPeerSession(`peer-99887766-term-${i}`, dispose);
    });
    expect(waiting).not.toHaveBeenCalled();
    expect(isPeerSessionRetained(TERM)).toBe(true);
    expect(browsed[0]).toHaveBeenCalledTimes(1);
  });

  it("keeps peers apart", () => {
    const otherTerm = "peer-99887766-term-1";
    publishPeerSnapshot([
      { slug: SLUG, connected: false },
      { slug: "99887766", connected: false },
    ]);
    const dispose = vi.fn();
    const otherDispose = vi.fn();
    retainPeerSession(TERM, dispose);
    retainPeerSession(otherTerm, otherDispose);
    publishPeerSnapshot([{ slug: SLUG, connected: false }]);
    expect(otherDispose).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  });
});
