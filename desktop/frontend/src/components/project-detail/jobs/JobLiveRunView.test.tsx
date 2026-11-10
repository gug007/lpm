// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobLiveRunView } from "./JobLiveRunView";
import type { JobInfo } from "../../../jobsFormat";
import type { ContentZoom } from "../../../hooks/useContentZoom";

const bridge = vi.hoisted(() => ({
  JobLiveOutput: vi.fn(async () => null as unknown),
  JobHistory: vi.fn(async () => [] as unknown),
  TakeOverJobRun: vi.fn(),
}));
vi.mock("../../../../bridge/commands", () => bridge);
vi.mock("../../../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));
vi.mock("../../../highlight", () => ({ ensureLang: vi.fn(async () => false), tokenizeLines: vi.fn() }));
vi.mock("../../../store/app", () => ({ useAppStore: { getState: () => ({}) } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onLanded = vi.fn();
const onBack = vi.fn();

const zoom = {
  zoom: 1,
  percent: 100,
  zoomIn: () => {},
  zoomOut: () => {},
  zoomReset: () => {},
  canZoomIn: true,
  canZoomOut: true,
  surfaceRef: () => {},
} as unknown as ContentZoom;

const job = (fields: Partial<JobInfo>): JobInfo => ({
  id: "triage",
  label: "Support triage",
  valid: true,
  enabled: true,
  running: true,
  runningSince: 1_700_000_000,
  ...fields,
});

const show = (fields: Partial<JobInfo> = {}) =>
  act(async () => {
    root.render(
      <JobLiveRunView
        project="shop"
        job={job(fields)}
        zoom={zoom}
        onBack={onBack}
        onStop={() => {}}
        onLanded={onLanded}
      />,
    );
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

describe("JobLiveRunView", () => {
  it("streams the whole run so far, steps folded, with its question at the end", async () => {
    const said = Array.from({ length: 20 }, (_, i) => `Checked chat ${i + 1}.`).join("\n\n");
    bridge.JobLiveOutput.mockResolvedValue({
      text: [said, "→ Skill", "→ Bash", "→ Bash", "My draft for customer #482: Hi! We've refunded the second payment."].join("\n"),
    });
    await show({
      asks: [
        {
          id: "q1",
          askedAt: 1,
          status: "open",
          project: "shop",
          questions: [{ id: "a", type: "confirm", text: "Send this draft to customer #482?" }],
        },
      ],
    });
    await act(async () => {});

    const text = host.textContent ?? "";
    expect(text).toContain("Checked chat 1.");
    expect(text).toContain("Checked chat 20.");
    expect(text).toContain("→ Skill, Bash ×2 · 3 steps");
    expect(text).toContain("My draft for customer #482");
    expect(text.indexOf("Send this draft to customer #482?")).toBeGreaterThan(text.indexOf("My draft"));
    expect([...host.querySelectorAll("button")].map((b) => b.textContent?.trim())).toContain("Stop");
  });

  it("becomes the conversation the run landed in once it ends", async () => {
    await show();
    bridge.JobHistory.mockResolvedValue([
      { at: 1_600_000_000, result: "completed" },
      { at: 1_700_000_300, result: "completed", output: "Sent the reply." },
    ]);
    await show({ running: false, runningSince: undefined });
    await act(async () => {});
    expect(onLanded).toHaveBeenCalledWith(1_700_000_300);
    expect(onBack).not.toHaveBeenCalled();
  });
});
