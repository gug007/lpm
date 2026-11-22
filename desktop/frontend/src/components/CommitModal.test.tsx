// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  GitChangedFiles: vi.fn(),
  GitCommit: vi.fn(),
  GitAmendCommit: vi.fn(),
  GitCommitChecked: vi.fn(),
  GitPush: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), loading: vi.fn() }));

vi.mock("../../bridge/commands", () =>
  new Proxy(commands as Record<string, unknown>, {
    has: () => true,
    get: (t, prop: string) =>
      prop === "then" ? undefined : (t[prop] ?? vi.fn(() => Promise.resolve(null))),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy(
    {},
    {
      has: () => true,
      get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
    },
  ));
vi.mock("../notifications/toast", () => ({ toast }));
vi.mock("../hooks/useAIPicker", () => ({ useAIPicker: () => ({ anyAvailable: false }) }));
vi.mock("../hooks/useAIGeneration", () => ({
  isCanceledError: () => false,
  useAIGeneration: () => ({ generating: false, run: vi.fn(), cancel: vi.fn() }),
}));
vi.mock("../hooks/useCommitSplit", () => ({
  useCommitSplit: () => ({ groups: null, busy: false, setGroups: vi.fn(), plan: vi.fn() }),
}));
vi.mock("../hooks/useSecretCheck", () => ({
  useSecretCheck: () => ({ checking: false, findings: [], guard: () => Promise.resolve(true) }),
}));
vi.mock("../hooks/useSelectedLineCounts", () => ({
  useSelectedLineCounts: () => ({ selected: null, byPath: new Map() }),
}));
vi.mock("./ChangedFilesTree", () => ({
  ChangedFilesTree: () => null,
  TriStateCheckbox: () => null,
  checkState: () => "all",
}));

import { CommitModal } from "./CommitModal";
import type { HistoryCommit } from "../gitHistory";

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onCommitted = vi.fn();

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function commitAndPush() {
  await act(async () => {
    root.render(
      <CommitModal open projectName="blog" projectPath="/blog" onClose={onClose} onCommitted={onCommitted} />,
    );
  });
  await settle();
  const box = document.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Update readme");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const commit = button("Commit");
  await act(async () => (commit.nextElementSibling as HTMLButtonElement).click());
  await act(async () => button("Commit and Push").click());
  await settle();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  commands.GitChangedFiles.mockResolvedValue([{ path: "README.md", status: "modified", staged: false }]);
  commands.GitCommitChecked.mockResolvedValue(null);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Commit and Push", () => {
  it("says the commit landed when only the push fails", async () => {
    commands.GitPush.mockRejectedValue("fatal: 'origin' does not appear to be a git repository");
    await commitAndPush();

    expect(commands.GitCommitChecked).toHaveBeenCalledWith("/blog", "Update readme", ["README.md"], null, false);
    expect(toast.error).toHaveBeenCalledWith("Committed, but not pushed", {
      description: "fatal: 'origin' does not appear to be a git repository",
    });
    expect(onCommitted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the dialog open when the commit itself fails", async () => {
    commands.GitCommitChecked.mockRejectedValue("nothing to commit");
    await commitAndPush();

    expect(commands.GitPush).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Commit & push failed: nothing to commit");
    expect(onClose).not.toHaveBeenCalled();
  });
});

const headCommit = (hash: string, subject: string): HistoryCommit => ({
  hash,
  short: hash.slice(0, 7),
  subject,
  body: "",
  author: "Ana",
  email: "ana@example.com",
  time: 0,
  parents: 1,
  parentHashes: ["p"],
  refs: [],
  coAuthors: [],
  unpushed: true,
});

describe("Amend last commit", () => {
  it("amends the commit it was turned on for, even after a new one lands", async () => {
    const render = (last: HistoryCommit) =>
      act(async () => {
        root.render(
          <CommitModal
            open
            projectName="blog"
            projectPath="/blog"
            onClose={onClose}
            onCommitted={onCommitted}
            lastCommit={last}
          />,
        );
      });
    await render(headCommit("a".repeat(40), "Fix A"));
    await settle();
    const toggle = [...document.querySelectorAll("label")]
      .find((l) => l.textContent?.includes("Amend last commit"))!
      .querySelector("input")!;
    await act(async () => toggle.click());

    await render(headCommit("b".repeat(40), "Add B"));
    await settle();
    await act(async () => button("Amend").click());
    await settle();

    expect(commands.GitCommitChecked).toHaveBeenCalledWith("/blog", "Fix A", ["README.md"], "a".repeat(40), false);
  });
});
