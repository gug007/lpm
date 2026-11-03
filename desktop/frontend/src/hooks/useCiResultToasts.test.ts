// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  open: vi.fn(),
  ask: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../bridge/runtime", () => ({
  BrowserOpenURL: mocks.open,
  EventsOn: (name: string, handler: (payload: unknown) => void) => {
    mocks.handlers.set(name, handler);
    return () => mocks.handlers.delete(name);
  },
}));
const CODEX = { id: "codex", label: "Codex", agent: "codex" };
vi.mock("../ciFix", () => ({
  fixTabs: (project: string) => [{ key: project, label: "", options: [CODEX], primary: CODEX }],
  preferredFixOption: () => CODEX,
  startFix: mocks.ask,
}));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { useCiResultToasts } from "./useCiResultToasts";

const RESULT = {
  project: "lpm",
  projectLabel: "lpm",
  branch: "main",
  sha: "fcb454f",
  title: "feat(cli): add remote command execution",
  url: "https://github.com/o/r/commit/fcb454f",
  passed: false,
  summary: "CI failed: Linux host",
  fixPrompt: "CI checks are failing on main … `gh run view 41 --log-failed` …",
};

let root: Root;

function Harness() {
  useCiResultToasts();
  return null;
}

const emit = (name: string, payload: unknown) => act(() => mocks.handlers.get(name)?.(payload));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Harness)));
});

afterEach(() => act(() => root.unmount()));

describe("useCiResultToasts", () => {
  it("says a push failed, under the CI setting, with the fixing agent and GitHub a click away", () => {
    emit("ci-result", RESULT);
    const [title, options] = mocks.error.mock.calls[0];
    expect(title).toBe("CI failed: Linux host");
    expect(options).toMatchObject({
      id: "ci::lpm/main",
      tag: "lpm · main",
      event: "ci",
      description: "fcb454f feat(cli): add remote command execution",
    });
    expect(options.action.label).toBe("Fix with Codex");
    options.action.onClick();
    expect(mocks.ask).toHaveBeenCalledWith("lpm", CODEX, expect.stringContaining("gh run view 41 --log-failed"));
    options.actions[0].onClick();
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/o/r/commit/fcb454f/checks");
  });

  it("replaces the failure once the branch passes again", () => {
    emit("ci-result", { ...RESULT, passed: true, summary: "CI passes again", fixPrompt: undefined });
    expect(mocks.success).toHaveBeenCalledWith(
      "CI passes again",
      expect.objectContaining({ id: "ci::lpm/main", event: "ci" }),
    );
  });

  it("names a connected computer, and leaves fixing to that computer", () => {
    emit("peer-ci-result", { ...RESULT, slug: "studio", machine: "Studio" });
    const [, options] = mocks.error.mock.calls[0];
    expect(options.id).toBe("ci:studio:lpm/main");
    expect(options.tag).toBe("lpm · main on Studio");
    expect(options.action.label).toBe("Open");
    expect(options.actions).toBeUndefined();
  });
});
