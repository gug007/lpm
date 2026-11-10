// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobRunningRow } from "./JobRunningRow";
import type { JobInfo } from "../../../jobsFormat";

const bridge = vi.hoisted(() => ({
  JobLiveOutput: vi.fn(async () => null as unknown),
  TakeOverJobRun: vi.fn(),
}));

const store = vi.hoisted(() => ({ selectProject: vi.fn(), queueSpawnTask: vi.fn() }));

vi.mock("../../../../bridge/commands", () => bridge);
vi.mock("../../../store/app", () => ({ useAppStore: { getState: () => store } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const job = (fields: Partial<JobInfo>): JobInfo => ({
  id: "triage",
  valid: true,
  enabled: true,
  running: true,
  runningSince: 1_000,
  ...fields,
});

const onOpen = vi.fn();

const show = (fields: Partial<JobInfo>, onOpenCopy: (project: string) => void = () => {}) =>
  act(async () => {
    root.render(
      <JobRunningRow
        project="app"
        job={job(fields)}
        now={1_000_000}
        onStop={() => {}}
        onOpenCopy={onOpenCopy}
        onOpen={onOpen}
      />,
    );
  });

const click = (label: string) =>
  act(async () => {
    [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!.click();
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("JobRunningRow", () => {
  it("says what a run is doing before it has any output", async () => {
    await show({ runningStep: "copy" });
    expect(host.textContent).toContain("Copying the project…");
    expect(host.textContent).not.toContain("No output yet.");
    expect(bridge.JobLiveOutput).not.toHaveBeenCalled();
  });

  it("names the copy a run works in and opens it", async () => {
    const onOpenCopy = vi.fn();
    await show({ runningIn: "app-x1", runningInName: "UAI-5401" }, onOpenCopy);
    expect(host.textContent).toContain("Working in UAI-5401");
    await click("UAI-5401");
    expect(onOpenCopy).toHaveBeenCalledWith("app-x1");
  });

  it("says so when a working run has printed nothing", async () => {
    bridge.JobLiveOutput.mockResolvedValueOnce({ text: "" });
    await show({});
    expect(host.textContent).toContain("No output yet.");
    expect(host.textContent).not.toContain("Take over in terminal");
  });

  it("claims nothing about a run that isn't in this project", async () => {
    await show({});
    expect(host.textContent).not.toContain("No output yet.");
  });

  it("opens the run it shows, while it's still going", async () => {
    await show({});
    await click("Running");
    expect(onOpen).toHaveBeenCalled();
  });

  it("shows the question the run asked inside the run, not apart from it", async () => {
    const ask = {
      id: "q1",
      askedAt: 1,
      status: "open",
      questions: [{ id: "a", type: "confirm", text: "Send the draft to customer #482?" }],
    };
    await show({ asks: [ask] });
    expect(host.textContent).toContain("Send the draft to customer #482?");
  });

  it("opens the tab the run carries on in, where the app says it goes", async () => {
    const task = { kind: "fork", command: "claude --resume abc", label: "Triage" };
    bridge.TakeOverJobRun.mockResolvedValue({ project: "app-x1", task });

    await show({ takeOverIn: "shared-target" });
    await click("Take over in terminal");

    expect(bridge.TakeOverJobRun).toHaveBeenCalledWith("shared-target", "triage");
    expect(store.selectProject).toHaveBeenCalledWith("app-x1");
    expect(store.queueSpawnTask).toHaveBeenCalledWith("app-x1", task);
  });
});
