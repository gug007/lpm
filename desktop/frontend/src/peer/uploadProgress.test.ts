import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loading: vi.fn(),
  dismiss: vi.fn(),
  peerState: vi.fn(),
  handlers: {} as Record<string, (payload: unknown) => void>,
}));

vi.mock("sonner", () => ({
  toast: { loading: mocks.loading, dismiss: mocks.dismiss },
}));
vi.mock("../../bridge/commands", () => ({ PeerState: mocks.peerState }));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    mocks.handlers[name] = cb;
    return () => {};
  },
}));

import { SHOW_AFTER_MS, trackPeerUpload, uploadToast } from "./uploadProgress";

const SLUG = "a1b2c3d4";

function progress(token: string, sent: number, total: number) {
  mocks.handlers["peer-upload-progress"]?.({
    token,
    name: "big.zip",
    sent,
    total,
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.peerState.mockResolvedValue({
    host: {},
    peers: [{ slug: SLUG, alias: "Studio", host: "studio.local" }],
  });
});

afterEach(() => {
  vi.useRealTimers();
  mocks.loading.mockReset();
  mocks.dismiss.mockReset();
  mocks.peerState.mockReset();
});

describe("uploadToast", () => {
  it("names the file and the Mac, with the bytes so far", () => {
    expect(
      uploadToast("big.zip", "Studio", 12 * 1024 * 1024, 48 * 1024 * 1024),
    ).toEqual({
      title: "Sending big.zip to Studio…",
      description: "12 MB of 48 MB",
    });
  });

  it("leaves the byte line off until the size is known", () => {
    expect(uploadToast("big.zip", "Studio", 0, 0)).toEqual({
      title: "Sending big.zip to Studio…",
    });
  });
});

describe("trackPeerUpload", () => {
  it("never shows a toast for an upload that lands quickly", async () => {
    const d = deferred<string>();
    const tracked = trackPeerUpload("t1", SLUG, "small.txt", d.promise);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS / 2);
    d.resolve("/host/small.txt");
    await expect(tracked).resolves.toBe("/host/small.txt");
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(mocks.loading).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("shows a slow upload's progress under the peer's alias and clears it on success", async () => {
    const d = deferred<string>();
    const tracked = trackPeerUpload("t2", SLUG, "big.zip", d.promise);
    progress("t2", 1024 * 1024, 40 * 1024 * 1024);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(mocks.loading).toHaveBeenLastCalledWith(
      "Sending big.zip to Studio…",
      {
        id: "t2",
        description: "1 MB of 40 MB",
        duration: Infinity,
      },
    );
    progress("t2", 20 * 1024 * 1024, 40 * 1024 * 1024);
    expect(mocks.loading).toHaveBeenLastCalledWith(
      "Sending big.zip to Studio…",
      {
        id: "t2",
        description: "20 MB of 40 MB",
        duration: Infinity,
      },
    );
    d.resolve("/host/big.zip");
    await expect(tracked).resolves.toBe("/host/big.zip");
    expect(mocks.dismiss).toHaveBeenCalledWith("t2");
  });

  it("clears the toast and passes the failure through", async () => {
    const d = deferred<string>();
    const tracked = trackPeerUpload("t3", SLUG, "big.zip", d.promise);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(mocks.loading).toHaveBeenCalledTimes(1);
    d.reject("that upload expired — start it again");
    await expect(tracked).rejects.toBe("that upload expired — start it again");
    expect(mocks.dismiss).toHaveBeenCalledWith("t3");
  });

  it("ignores progress for uploads it is not tracking", async () => {
    progress("nobody", 1, 2);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(mocks.loading).not.toHaveBeenCalled();
  });

  it("falls back to a generic name when the peer list cannot be read", async () => {
    mocks.peerState.mockRejectedValue("peer server not ready");
    const d = deferred<string>();
    const tracked = trackPeerUpload("t4", SLUG, "big.zip", d.promise);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(mocks.loading).toHaveBeenLastCalledWith(
      "Sending big.zip to another Mac…",
      expect.objectContaining({ id: "t4" }),
    );
    d.resolve("/host/big.zip");
    await tracked;
  });
});
