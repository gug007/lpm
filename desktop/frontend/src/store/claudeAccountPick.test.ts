import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tabAccount: vi.fn(),
  setChoice: vi.fn(),
  requestMoves: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({ TerminalClaudeAccount: mocks.tabAccount }));
vi.mock("./claudeAccountPin", () => ({ setClaudeAccountChoice: mocks.setChoice }));
vi.mock("./claudeTabMoves", () => ({ requestClaudeTabMoves: mocks.requestMoves }));

import { answerTabAccountQuestion, dismissTabAccountQuestion, pickClaudeAccount, useTabAccountQuestion } from "./claudeAccountPick";
import { useProjectClaudeTabs } from "./projectClaudeTabs";

const ACCOUNTS: Record<string, string> = { t1: "default", t2: "default", t3: "side" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setChoice.mockResolvedValue(true);
  mocks.tabAccount.mockImplementation((id: string) => Promise.resolve(ACCOUNTS[id] ?? ""));
  useProjectClaudeTabs.setState({ byProject: { lpm: { ids: ["t1", "t2", "t3"], selected: "t1", working: ["t1"] } } });
  useTabAccountQuestion.setState({ question: null });
});

describe("pickClaudeAccount", () => {
  it("asks about every Claude tab when some run on another account", async () => {
    await pickClaudeAccount("lpm", { kind: "pin", id: "side" });
    expect(mocks.setChoice).not.toHaveBeenCalled();
    expect(useTabAccountQuestion.getState().question).toEqual({
      projectName: "lpm",
      choice: { kind: "pin", id: "side" },
      account: "side",
      tabs: [
        { id: "t1", from: "default" },
        { id: "t2", from: "default" },
        { id: "t3", from: "side" },
      ],
      selected: "t1",
    });
  });

  it("pins straight away when every Claude tab already runs on the account", async () => {
    useProjectClaudeTabs.setState({ byProject: { lpm: { ids: ["t3"], selected: null, working: [] } } });
    await pickClaudeAccount("lpm", { kind: "pin", id: "side" });
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "side" });
    expect(useTabAccountQuestion.getState().question).toBeNull();
  });

  it("reads the main login as its own account", async () => {
    useProjectClaudeTabs.setState({ byProject: { lpm: { ids: ["t1", "t2"], selected: "t1", working: [] } } });
    await pickClaudeAccount("lpm", { kind: "pin", id: "" });
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "" });
  });

  it("pins straight away in a project without Claude tabs", async () => {
    useProjectClaudeTabs.setState({ byProject: {} });
    await pickClaudeAccount("lpm", { kind: "pin", id: "side" });
    expect(mocks.tabAccount).not.toHaveBeenCalled();
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "side" });
  });

  it("never asks for a choice that isn't one account", async () => {
    await pickClaudeAccount("lpm", { kind: "main" });
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "main" });
    expect(useTabAccountQuestion.getState().question).toBeNull();
  });

  it("counts a tab whose account can't be read as on another one", async () => {
    mocks.tabAccount.mockRejectedValue(new Error("gone"));
    useProjectClaudeTabs.setState({ byProject: { lpm: { ids: ["t3"], selected: "t3", working: [] } } });
    await pickClaudeAccount("lpm", { kind: "pin", id: "side" });
    expect(useTabAccountQuestion.getState().question?.tabs).toEqual([{ id: "t3", from: null }]);
  });
});

describe("answering", () => {
  beforeEach(() => pickClaudeAccount("lpm", { kind: "pin", id: "side" }));

  it("pins and moves the ticked tabs", async () => {
    await answerTabAccountQuestion(["t1", "t2"]);
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "side" });
    expect(mocks.requestMoves).toHaveBeenCalledWith("lpm", ["t1", "t2"], "side");
    expect(useTabAccountQuestion.getState().question).toBeNull();
  });

  it("pins only, for new sessions", async () => {
    await answerTabAccountQuestion([]);
    expect(mocks.setChoice).toHaveBeenCalledWith("lpm", { kind: "pin", id: "side" });
    expect(mocks.requestMoves).not.toHaveBeenCalled();
  });

  it("leaves the tabs alone when the pin fails", async () => {
    mocks.setChoice.mockResolvedValue(false);
    await answerTabAccountQuestion(["t1"]);
    expect(mocks.requestMoves).not.toHaveBeenCalled();
  });

  it("changes nothing when dismissed", () => {
    dismissTabAccountQuestion();
    expect(useTabAccountQuestion.getState().question).toBeNull();
    expect(mocks.setChoice).not.toHaveBeenCalled();
  });
});
