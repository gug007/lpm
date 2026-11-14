// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryCommit } from "../gitHistory";

const bridge = vi.hoisted(() => ({
  checks: vi.fn(),
}));

vi.mock("../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge/commands")>()),
  RecentCommitChecks: (cwd: string) => bridge.checks(cwd),
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {}, BrowserOpenURL: vi.fn() }));

import { BranchCommitCard } from "./BranchCommitCard";

function commit(hash: string, over: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    hash,
    short: hash.slice(0, 7),
    subject: `Subject of ${hash}`,
    body: "",
    author: "Dana Reyes",
    email: "dana@example.com",
    time: Math.floor(Date.now() / 1000) - 7200,
    parents: 1,
    parentHashes: [],
    refs: [],
    coAuthors: [],
    unpushed: false,
    ...over,
  };
}

let host: HTMLDivElement;
let root: Root;

const handlers = { onOpen: vi.fn(), onViewHistory: vi.fn(), onUndo: vi.fn() };

async function card(commits: HistoryCommit[], undo = false) {
  await act(async () => {
    root.render(
      <BranchCommitCard
        commits={commits}
        onOpen={handlers.onOpen}
        onViewHistory={handlers.onViewHistory}
        onUndo={undo ? handlers.onUndo : undefined}
      />,
    );
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("BranchCommitCard", () => {
  it("lists each commit's subject, short hash and age", async () => {
    await card([commit("aaaaaaa1"), commit("bbbbbbb2")]);

    expect(host.textContent).toContain("Subject of aaaaaaa1");
    expect(host.textContent).toContain("Subject of bbbbbbb2");
    expect(host.textContent).toContain("aaaaaaa");
    expect(host.textContent).toContain("2h ago");
  });

  it("leaves CI out of the card and never asks for it", async () => {
    await card([commit("aaaaaaa1")]);

    expect(bridge.checks).not.toHaveBeenCalled();
    expect(host.querySelector('[role="img"]')).toBeNull();
  });

  it("gives a commit no remote has the arrow, on the right of its row", async () => {
    await card([commit("aaaaaaa1", { unpushed: true }), commit("bbbbbbb2")]);

    const marks = host.querySelectorAll('[role="img"]');
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("aria-label")).toBe("Not pushed yet");
    const row = marks[0].parentElement!;
    expect(row.lastElementChild).toBe(marks[0]);
    expect(row.firstElementChild!.textContent).toContain("Subject of aaaaaaa1");
  });

  it("opens a commit in History and History itself", async () => {
    const commits = [commit("aaaaaaa1"), commit("bbbbbbb2")];
    await card(commits);

    await act(async () => button("Subject of bbbbbbb2").click());
    expect(handlers.onOpen).toHaveBeenCalledWith(commits[1]);
    await act(async () => button("View history").click());
    expect(handlers.onViewHistory).toHaveBeenCalledTimes(1);
  });

  it("offers Undo commit on the newest row only, in place of its arrow", async () => {
    const commits = [commit("aaaaaaa1", { unpushed: true }), commit("bbbbbbb2", { unpushed: true })];
    await card(commits, true);

    expect(host.querySelectorAll("button")).toHaveLength(4);
    expect(host.querySelectorAll('[role="img"]')).toHaveLength(1);
    await act(async () => button("Undo commit").click());
    expect(handlers.onUndo).toHaveBeenCalledWith(commits[0]);
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it("offers no Undo when the newest commit can't be taken back", async () => {
    await card([commit("aaaaaaa1")]);

    expect(host.textContent).not.toContain("Undo commit");
  });
});
