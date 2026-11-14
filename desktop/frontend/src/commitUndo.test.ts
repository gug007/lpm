// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryCommit } from "./gitHistory";
import { commitDraft, saveCommitDraft } from "./store/commitDrafts";

const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(async () => {}),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../bridge/commands", () => ({ GitUndoCommit: mocks.undo, GitRedoCommit: mocks.redo }));
vi.mock("./notifications/toast", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { undoCommit } from "./commitUndo";

const ROOT = "/p/web";

function commit(subject: string): HistoryCommit {
  return {
    hash: `${subject}-hash`,
    short: "abc1234",
    subject,
    body: "",
    author: "lpm",
    email: "lpm@example.com",
    time: 0,
    parents: 1,
    parentHashes: ["parent"],
  } as HistoryCommit;
}

async function undo(message: string): Promise<() => Promise<void>> {
  mocks.undo.mockResolvedValueOnce({ hash: `${message}-hash`, message, files: 2 });
  await undoCommit(ROOT, commit(message), () => {});
  const options = mocks.toastSuccess.mock.calls.at(-1)?.[1] as { action: { onClick: () => void } };
  return async () => {
    options.action.onClick();
    await vi.waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Committed again"));
  };
}

describe("undoCommit", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("makes the commit's message the draft, and Redo clears it", async () => {
    const redo = await undo("Fix the header");
    expect(commitDraft(ROOT)?.message).toBe("Fix the header");
    await redo();
    expect(commitDraft(ROOT)).toBeNull();
  });

  it("keeps a message already typed in Commit, below the commit's", async () => {
    saveCommitDraft(ROOT, "Half-written message");
    await undo("Fix the header");
    expect(commitDraft(ROOT)?.message).toBe("Fix the header\n\nHalf-written message");
  });

  it("gives the typed message back on Redo", async () => {
    saveCommitDraft(ROOT, "Half-written message");
    const redo = await undo("Fix the header");
    await redo();
    expect(commitDraft(ROOT)?.message).toBe("Half-written message");
  });

  it("keeps both messages when two commits are undone", async () => {
    await undo("Second commit");
    await undo("First commit");
    expect(commitDraft(ROOT)?.message).toBe("First commit\n\nSecond commit");
  });

  it("leaves a draft edited after the undo alone on Redo", async () => {
    const redo = await undo("Fix the header");
    saveCommitDraft(ROOT, "Fix the header, and the footer");
    await redo();
    expect(commitDraft(ROOT)?.message).toBe("Fix the header, and the footer");
  });
});
