// @vitest-environment happy-dom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrMergeOffer, PullRequestInfo, PullRequestMergeInfo } from "../types";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  ask: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  offer: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: (url: string) => mocks.open(url) }));
vi.mock("../../bridge/commands", async (original) => ({
  ...(await original<typeof import("../../bridge/commands")>()),
  PullRequestMergeOffer: mocks.offer,
  MergePullRequest: mocks.merge,
}));
vi.mock("../ciFix", () => ({ startFix: mocks.ask }));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { prLook } from "../prLook";
import { useBranchPr } from "../store/branchPr";
import { BranchPrLink } from "./BranchPrLink";

const PR: PullRequestInfo = {
  number: 128,
  url: "https://github.com/o/r/pull/128",
  state: "OPEN",
  title: "Tables label visibility",
  isDraft: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  for (const mock of Object.values(mocks)) mock.mockReset();
  localStorage.clear();
});

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("BranchPrLink", () => {
  it("names the PR and opens a merged one on GitHub when clicked", () => {
    const merged: PullRequestInfo = { ...PR, state: "MERGED" };
    act(() => root.render(<BranchPrLink pr={merged} branch="feat/labels" projectName="api" projectPath="/p" />));
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("PR #128");
    expect(button.title).toBe("Merged pull request #128: Tables label visibility");
    act(() => button.click());
    expect(mocks.open).toHaveBeenCalledWith(PR.url);
    expect(mocks.offer).not.toHaveBeenCalled();
  });

  it("colours each state differently", () => {
    expect(prLook(PR).label).toBe("Open");
    expect(prLook({ ...PR, isDraft: true }).label).toBe("Draft");
    expect(prLook({ ...PR, state: "MERGED" }).label).toBe("Merged");
    expect(prLook({ ...PR, state: "CLOSED" }).label).toBe("Closed");
    expect(new Set([PR, { ...PR, isDraft: true }, { ...PR, state: "MERGED" as const }, { ...PR, state: "CLOSED" as const }].map((p) => prLook(p).color)).size).toBe(4);
  });

  it("adds how the checks stand, and lists them on click", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [
        { name: "lint", workflow: "CI", state: "pass", url: "https://github.com/o/r/actions/runs/7/job/1" },
        { name: "test", workflow: "CI", state: "fail", url: "https://github.com/o/r/actions/runs/7/job/2" },
      ],
    };
    act(() => root.render(<BranchPrLink pr={pr} branch="feat/labels" projectName="api" projectPath="/p" />));
    const [link, checks] = container.querySelectorAll("button");
    expect(link.textContent).toBe("PR #128");
    expect(checks.textContent).toBe("1 failing");
    act(() => checks.click());
    expect(document.body.textContent).toContain("Checks on #128");
    act(() => buttonByText("test")!.click());
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/o/r/actions/runs/7/job/2");
  });

  it("hands the failing checks to the agent picked, in the Mac's words", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "fail", url: "https://github.com/o/r/actions/runs/7/job/2" }],
      fixPrompt: "Find out why with `gh run view 7 --log-failed`",
    };
    act(() => root.render(<BranchPrLink pr={pr} branch="feat/labels" projectName="api" projectPath="/p" />));
    act(() => container.querySelectorAll("button")[1].click());
    expect(buttonByText("Fix with Claude")).toBeDefined();
    act(() => buttonByText("Fix with Codex")!.click());
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    const [project, option, prompt] = mocks.ask.mock.calls[0];
    expect(project).toBe("api");
    expect(option.agent).toBe("codex");
    expect(prompt).toContain("gh run view 7 --log-failed");
  });

  it("offers no Fix with Claude without the Mac's prompt", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "fail", url: "https://github.com/o/r/actions/runs/7/job/2" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} branch="feat/labels" projectName="api" projectPath="/p" />));
    act(() => container.querySelectorAll("button")[1].click());
    expect(buttonByText("Fix with Claude")).toBeUndefined();
    expect(buttonByText("Re-run failed jobs")).toBeDefined();
  });

  it("leaves a merged PR's checks off the pill", () => {
    const pr: PullRequestInfo = {
      ...PR,
      state: "MERGED",
      checks: [{ name: "test", workflow: "CI", state: "fail", url: "" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} branch="feat/labels" projectName="api" projectPath="/p" />));
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("shows only a check mark once every check passed", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "pass", url: "" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} branch="feat/labels" projectName="api" projectPath="/p" />));
    const checks = container.querySelectorAll("button")[1];
    expect(checks.textContent).toBe("");
    expect(checks.title).toBe("Checks on #128: Checks passed");
  });

  describe("card", () => {
    const offer = (merge: Partial<PrMergeOffer> = {}, extra: Partial<PullRequestMergeInfo> = {}): PullRequestMergeInfo => ({
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "pass", url: "" }],
      merge: {
        mergeable: "MERGEABLE",
        state: "CLEAN",
        review: "APPROVED",
        head: "9e7d031",
        base: "main",
        methods: ["merge", "squash", "rebase"],
        deletesBranch: false,
        ...merge,
      },
      ...extra,
    });
    const text = () => document.body.textContent ?? "";

    async function openCard(answer: PullRequestMergeInfo | null) {
      mocks.offer.mockResolvedValue(answer);
      // As the app runs: effects mount, unmount and mount again.
      act(() =>
        root.render(
          <StrictMode>
            <BranchPrLink pr={PR} branch="feat/labels" projectName="api" projectPath="/p" />
          </StrictMode>,
        ),
      );
      await act(async () => container.querySelector("button")!.click());
    }

    it("shows how an open PR stands and merges it with the method picked", async () => {
      mocks.merge.mockResolvedValue(true);
      await openCard(offer());
      expect(mocks.offer).toHaveBeenCalledWith("/p");
      expect(mocks.open).not.toHaveBeenCalled();
      expect(text()).toContain("feat/labels → main");
      expect(text()).toContain("All checks passed");
      expect(text()).toContain("Approved");
      expect(text()).toContain("No conflicts with main");
      expect(buttonByText("Squash and merge")!.disabled).toBe(false);
      expect(useBranchPr.getState().entries["/p"]).toMatchObject({ branch: "feat/labels", pr: { state: "OPEN" } });

      act(() => document.querySelector<HTMLButtonElement>('[aria-label="Merge method"]')!.click());
      act(() => buttonByText("Rebase and merge")!.click());
      expect(localStorage.getItem("lpm.prMerge.method")).toBe("rebase");
      await act(async () => buttonByText("Rebase and merge")!.click());

      expect(mocks.merge).toHaveBeenCalledWith("/p", 128, "rebase", "9e7d031", true);
      expect(mocks.success).toHaveBeenCalledWith("Merged #128", {
        description: "Its branch was deleted on GitHub. This checkout stays on feat/labels.",
      });
      expect(text()).not.toContain("No conflicts with main");
      expect(useBranchPr.getState().entries["/p"].pr?.state).toBe("MERGED");
    });

    it("keeps the branch when unticked, and says GitHub deletes it when it does", async () => {
      mocks.merge.mockResolvedValue(false);
      await openCard(offer());
      act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      await act(async () => buttonByText("Squash and merge")!.click());
      expect(mocks.merge).toHaveBeenCalledWith("/p", 128, "squash", "9e7d031", false);

      act(() => root.unmount());
      root = createRoot(container);
      await openCard(offer({ deletesBranch: true, methods: ["squash"] }));
      expect(text()).toContain("GitHub deletes the branch once it's merged.");
      expect(document.querySelector('input[type="checkbox"]')).toBeNull();
      expect(document.querySelector('[aria-label="Merge method"]')).toBeNull();
    });

    it("holds the merge back and says why", async () => {
      await openCard(offer({ state: "BEHIND" }));
      expect(text()).toContain("This branch is behind main. Update it before merging.");
      expect(buttonByText("Squash and merge")!.disabled).toBe(true);
    });

    it("hands a conflict to the agent picked", async () => {
      await openCard(offer({ mergeable: "CONFLICTING", state: "DIRTY" }, { resolvePrompt: "Merge main into feat/labels" }));
      expect(text()).toContain("Conflicts with main");
      expect(buttonByText("Squash and merge")!.disabled).toBe(true);
      act(() => buttonByText("Fix with Claude")!.click());
      expect(mocks.ask).toHaveBeenCalledWith("api", expect.objectContaining({ agent: "claude" }), "Merge main into feat/labels");
    });

    it("shows what GitHub said when the merge fails", async () => {
      mocks.merge.mockRejectedValue("Pull request #128 is not mergeable");
      await openCard(offer());
      await act(async () => buttonByText("Squash and merge")!.click());
      expect(document.querySelector('[role="alert"]')!.textContent).toBe("Pull request #128 is not mergeable");
      expect(buttonByText("Squash and merge")!.disabled).toBe(false);
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.error).not.toHaveBeenCalled();
    });

    it("falls back to GitHub when it can't say", async () => {
      await openCard(null);
      expect(text()).toContain("GitHub didn't say how this pull request stands.");
      act(() => buttonByText("Open on GitHub")!.click());
      expect(mocks.open).toHaveBeenCalledWith(PR.url);
    });
  });
});
