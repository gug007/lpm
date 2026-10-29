// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestInfo } from "../types";

const mocks = vi.hoisted(() => ({ open: vi.fn(), ask: vi.fn(), success: vi.fn() }));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: (url: string) => mocks.open(url) }));
vi.mock("../agentTabPrompt", () => ({ askClaudeInNewTab: mocks.ask }));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success } }));

import { BranchPrLink, prLook } from "./BranchPrLink";

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
  mocks.open.mockReset();
  mocks.ask.mockReset();
});

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("BranchPrLink", () => {
  it("names the PR and opens it on GitHub when clicked", () => {
    act(() => root.render(<BranchPrLink pr={PR} projectName="api" />));
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("PR #128");
    expect(button.title).toBe("Open pull request #128: Tables label visibility");
    act(() => button.click());
    expect(mocks.open).toHaveBeenCalledWith(PR.url);
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
    act(() => root.render(<BranchPrLink pr={pr} projectName="api" />));
    const [link, checks] = container.querySelectorAll("button");
    expect(link.textContent).toBe("PR #128");
    expect(checks.textContent).toBe("1 failing");
    act(() => checks.click());
    expect(document.body.textContent).toContain("Checks on #128");
    act(() => buttonByText("test")!.click());
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/o/r/actions/runs/7/job/2");
  });

  it("hands the failing checks to Claude in a new tab", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "fail", url: "https://github.com/o/r/actions/runs/7/job/2" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} projectName="api" />));
    act(() => container.querySelectorAll("button")[1].click());
    act(() => buttonByText("Fix with Claude")!.click());
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    const [project, prompt] = mocks.ask.mock.calls[0];
    expect(project).toBe("api");
    expect(prompt).toContain("gh run view 7 --log-failed");
  });

  it("leaves a merged PR's checks off the pill", () => {
    const pr: PullRequestInfo = {
      ...PR,
      state: "MERGED",
      checks: [{ name: "test", workflow: "CI", state: "fail", url: "" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} projectName="api" />));
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("shows only a check mark once every check passed", () => {
    const pr: PullRequestInfo = {
      ...PR,
      checks: [{ name: "test", workflow: "CI", state: "pass", url: "" }],
    };
    act(() => root.render(<BranchPrLink pr={pr} projectName="api" />));
    const checks = container.querySelectorAll("button")[1];
    expect(checks.textContent).toBe("");
    expect(checks.title).toBe("Checks on #128: Checks passed");
  });
});
