// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ answer: vi.fn() }));

vi.mock("../../bridge/commands", () => ({}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({ projects: [{ name: "storefront" }] }),
}));
vi.mock("../hooks/useClaudeAccountsOf", () => ({
  useKnownClaudeAccountsOf: () => ({
    accounts: [
      { id: "work", label: "Work" },
      { id: "side", label: "Personal" },
    ],
    statuses: {},
    pool: null,
  }),
}));
vi.mock("../store/claudeAccountPick", async (original) => ({
  ...(await original<typeof import("../store/claudeAccountPick")>()),
  answerTabAccountQuestion: mocks.answer,
}));

import { useTabAccountQuestion } from "../store/claudeAccountPick";
import { useProjectClaudeTabs } from "../store/projectClaudeTabs";
import { useTerminalTitles } from "../store/terminalTitles";
import { ClaudeTabAccountQuestion } from "./ClaudeTabAccountQuestion";

let host: HTMLDivElement;
let root: Root;

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const rows = () => [...document.querySelectorAll("label")];
const box = (title: string) =>
  rows().find((r) => r.textContent?.includes(title))?.querySelector("input") as HTMLInputElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
  useTerminalTitles.setState({
    byProject: { storefront: { t1: "Fix checkout rounding", t2: "Plan five features", t3: "Write release notes" } },
  });
  useProjectClaudeTabs.setState({
    byProject: { storefront: { ids: ["t1", "t2", "t3"], selected: "t1", working: ["t1"] } },
  });
  useTabAccountQuestion.setState({
    question: {
      projectName: "storefront",
      choice: { kind: "pin", id: "side" },
      account: "side",
      tabs: [
        { id: "t1", from: "work" },
        { id: "t2", from: "work" },
        { id: "t3", from: "side" },
      ],
      selected: "t1",
    },
  });
  act(() => root.render(<ClaudeTabAccountQuestion />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useTabAccountQuestion.setState({ question: null });
});

describe("ClaudeTabAccountQuestion", () => {
  it("lists every Claude tab with its account, the selected one ticked", () => {
    expect(document.body.textContent).toContain("Move open tabs to Personal?");
    expect(rows().map((r) => r.textContent)).toEqual([
      "Fix checkout roundingSelectedWork · working",
      "Plan five featuresWork · idle",
      "Write release notesAlready on Personal",
    ]);
    expect(box("Fix checkout rounding").checked).toBe(true);
    expect(box("Plan five features").checked).toBe(false);
    expect(box("Write release notes").disabled).toBe(true);
    expect(document.body.textContent).toContain("has its turn interrupted");
    expect(button("Move 1 tab").disabled).toBe(false);
  });

  it("moves the ticked tabs", () => {
    act(() => box("Plan five features").click());
    act(() => button("Move 2 tabs").click());
    expect(mocks.answer).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("holds back Move with nothing ticked, but not New sessions only", () => {
    act(() => box("Fix checkout rounding").click());
    expect(button("Move tabs").disabled).toBe(true);
    expect(document.body.textContent).not.toContain("has its turn interrupted");
    act(() => button("New sessions only").click());
    expect(mocks.answer).toHaveBeenCalledWith([]);
  });

  it("tells tabs with the same name apart by their place in the strip", () => {
    act(() =>
      useTerminalTitles.setState({ byProject: { storefront: { t0: "zsh", t1: "Claude", t2: "Claude", t3: "Notes" } } }),
    );
    expect(rows().map((r) => r.querySelector("span")?.textContent)).toEqual([
      "Claude · tab 2",
      "Claude · tab 3",
      "Notes",
    ]);
  });

  it("closes on Cancel without changing anything", () => {
    act(() => button("Cancel").click());
    expect(useTabAccountQuestion.getState().question).toBeNull();
    expect(mocks.answer).not.toHaveBeenCalled();
  });
});
