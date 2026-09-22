// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestInfo } from "../types";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: (url: string) => mocks.open(url) }));

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
});

describe("BranchPrLink", () => {
  it("names the PR and opens it on GitHub when clicked", () => {
    act(() => root.render(<BranchPrLink pr={PR} />));
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
});
