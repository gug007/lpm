// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  cancel: vi.fn(),
  reveal: vi.fn(),
  listeners: new Set<(p: unknown) => void>(),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("../../../bridge/commands", () => ({
  DownloadProjectFile: mocks.download,
  CancelFileDownload: mocks.cancel,
  RevealInFinder: mocks.reveal,
  PeerState: vi.fn(),
  SetClipboardText: vi.fn(),
}));
vi.mock("../../../bridge/runtime", () => ({
  EventsOn: (_: string, listener: (p: unknown) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));
vi.mock("../../notifications/toast", () => ({ toast: mocks.toast }));

import { revealLabel } from "../../machineWords";
import { canDownload, downloadFile } from "./downloadFile";

const emit = (payload: unknown) => mocks.listeners.forEach((listener) => listener(payload));
const idOf = () => mocks.download.mock.calls[0][0] as string;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
});

describe("canDownload", () => {
  it("offers files on another computer this one reads directly", () => {
    expect(canDownload({ root: "~/app", isRemote: true })).toBe(true);
    expect(canDownload({ root: "/@peer-abcd1234/srv/app", isRemote: false })).toBe(true);
  });

  it("leaves out files already here, and a paired computer's SSH project", () => {
    expect(canDownload({ root: "/Users/me/app", isRemote: false })).toBe(false);
    expect(canDownload({ root: "/@peer-abcd1234~/app", isRemote: true })).toBe(false);
    expect(canDownload(undefined)).toBe(false);
  });
});

describe("downloadFile", () => {
  it("shows nothing and leaves no listener when the dialog is dismissed", async () => {
    mocks.download.mockResolvedValue(null);
    await downloadFile("~/app", "deck/presentation.html");
    expect(mocks.download).toHaveBeenCalledWith(expect.any(String), "~/app", "deck/presentation.html");
    expect(mocks.toast.loading).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });

  it("follows the bytes, then offers to show the saved file", async () => {
    let finish!: (path: string) => void;
    mocks.download.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const done = downloadFile("~/app", "deck/presentation.html");

    emit({ id: idOf(), received: 0, total: 0 });
    expect(mocks.toast.loading).toHaveBeenLastCalledWith(
      "Downloading presentation.html…",
      expect.objectContaining({ id: idOf(), description: undefined }),
    );
    emit({ id: idOf(), received: 1024, total: 2048 });
    expect(mocks.toast.loading.mock.lastCall?.[1].description).toBe("1 KB of 2 KB");

    finish("/Users/me/Downloads/presentation.html");
    await done;
    const [title, options] = mocks.toast.success.mock.calls[0];
    expect(title).toBe("Downloaded presentation.html");
    expect(options.id).toBe(idOf());
    expect(options.action.label).toBe(revealLabel());
    options.action.onClick();
    expect(mocks.reveal).toHaveBeenCalledWith("/Users/me/Downloads/presentation.html");
  });

  it("ignores another download's progress", async () => {
    let finish!: (path: null) => void;
    mocks.download.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const done = downloadFile("~/app", "a.txt");
    emit({ id: "someone-else", received: 1, total: 2 });
    expect(mocks.toast.loading).not.toHaveBeenCalled();
    finish(null);
    await done;
  });

  it("cancels by id, and a stopped download closes its toast", async () => {
    let finish!: (path: null) => void;
    mocks.download.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const done = downloadFile("~/app", "big.iso");
    emit({ id: idOf(), received: 1, total: 2 });
    mocks.toast.loading.mock.lastCall?.[1].cancel.onClick();
    expect(mocks.cancel).toHaveBeenCalledWith(idOf());
    finish(null);
    await done;
    expect(mocks.toast.dismiss).toHaveBeenCalledWith(idOf());
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("turns the toast into the failure", async () => {
    mocks.download.mockRejectedValue("big.iso isn't a file");
    await downloadFile("~/app", "big.iso");
    expect(mocks.toast.error).toHaveBeenCalledWith("big.iso isn't a file", { id: idOf() });
    expect(mocks.listeners.size).toBe(0);
  });
});
