// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitChecksInfo } from "../types";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  ask: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  rerun: vi.fn<(cwd: string, ids: string[]) => Promise<void>>(),
}));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: (url: string) => mocks.open(url) }));
vi.mock("../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge/commands")>()),
  RerunFailedChecks: (cwd: string, ids: string[]) => mocks.rerun(cwd, ids),
}));
vi.mock("../ciFix", () => ({ startFix: mocks.ask }));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { useBranchPr } from "../store/branchPr";
import { BranchCiPill } from "./BranchCiPill";

const COMMIT: CommitChecksInfo = {
  sha: "e8ddefe9528798016cb5374322aa6e5c789d1669",
  title: "feat(config): add first commit age footer action",
  url: "https://github.com/o/r/commit/e8ddefe9528798016cb5374322aa6e5c789d1669",
  checks: [
    { name: "Vercel", workflow: "", state: "pass", url: "https://vercel.com/x" },
    {
      name: "check",
      workflow: "Linux host",
      state: "fail",
      url: "https://github.com/o/r/actions/runs/41/job/12",
      commit: "fcb454f",
    },
  ],
  fixPrompt: "CI checks are failing on main … `gh run view 41 --log-failed` …",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useBranchPr.setState({ entries: { "/p": { branch: "main", pr: null, commit: COMMIT, checkedAt: 1 } } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.values(mocks).forEach((m) => m.mockReset());
});

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

function render(commit: CommitChecksInfo = COMMIT, ahead = 0) {
  act(() =>
    root.render(<BranchCiPill projectName="lpm" projectPath="/p" branch="main" commit={commit} ahead={ahead} />),
  );
  return container.querySelector("button")!;
}

describe("BranchCiPill", () => {
  it("says CI and how many fail, counting a failure an earlier push left", () => {
    const pill = render();
    expect(pill.textContent).toBe("CI1 failing");
    expect(pill.title).toBe("CI on main: 1 failing");
  });

  it("is a bare check mark once everything passed", () => {
    const pill = render({ ...COMMIT, checks: [COMMIT.checks[0]] });
    expect(pill.textContent).toBe("CI");
    expect(pill.title).toBe("CI on main: Checks passed");
  });

  it("shows nothing for a commit without checks", () => {
    render({ ...COMMIT, checks: [] });
    expect(container.querySelector("button")).toBeNull();
  });

  it("lists the checks under the commit, marking the one from an earlier push", () => {
    const pill = render();
    act(() => pill.click());
    expect(document.body.textContent).toContain("Checks on main · e8ddefe");
    expect(document.body.textContent).toContain("feat(config): add first commit age footer action");
    expect(document.body.textContent).toContain("Linux host · on fcb454f");
    act(() => buttonByText("check")!.click());
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/o/r/actions/runs/41/job/12");
  });

  it("says when the newest commits aren't pushed yet", () => {
    const pill = render(COMMIT, 2);
    expect(pill.title).toBe("CI on main: 1 failing · 2 commits not pushed yet");
    act(() => pill.click());
    expect(document.body.textContent).toContain(
      "2 commits not pushed yet. These checks are for e8ddefe, the last one you pushed.",
    );
  });

  it("hands the failures to Claude in a new tab", () => {
    const pill = render();
    act(() => pill.click());
    act(() => buttonByText("Fix with Claude")!.click());
    const [project, option, prompt] = mocks.ask.mock.calls[0];
    expect(project).toBe("lpm");
    expect(option.agent).toBe("claude");
    expect(prompt).toContain("CI checks are failing on main");
    expect(prompt).toContain("gh run view 41 --log-failed");
  });

  it("runs the failed jobs again and shows them running", async () => {
    mocks.rerun.mockResolvedValue(undefined);
    const pill = render();
    act(() => pill.click());
    await act(async () => {
      buttonByText("Re-run failed jobs")!.click();
      await Promise.resolve();
    });
    expect(mocks.rerun).toHaveBeenCalledWith("/p", ["41"]);
    expect(mocks.success).toHaveBeenCalledWith("Running the failed jobs again");
    const states = useBranchPr.getState().entries["/p"].commit!.checks.map((c) => c.state);
    expect(states).toEqual(["pass", "pending"]);
  });

  it("opens the commit's checks on GitHub", () => {
    const pill = render();
    act(() => pill.click());
    act(() => buttonByText("Open checks on GitHub")!.click());
    expect(mocks.open).toHaveBeenCalledWith(`${COMMIT.url}/checks`);
  });
});
