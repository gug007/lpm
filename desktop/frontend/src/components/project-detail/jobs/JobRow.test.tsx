// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobRow } from "./JobRow";
import type { JobInfo } from "../../../jobsFormat";
import type { JobAsk } from "../../../jobAsk";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onRunNow = vi.fn();
const onToggleEnabled = vi.fn();

const question = (fields: Partial<JobAsk> = {}): JobAsk => ({
  id: "q1",
  askedAt: 1,
  status: "open",
  questions: [{ id: "a", type: "confirm", text: "Send the draft to customer #482?" }],
  ...fields,
});

const show = (fields: Partial<JobInfo>) =>
  act(async () => {
    root.render(
      <JobRow
        job={{ id: "triage", label: "Support triage", valid: true, enabled: true, ...fields }}
        onRunNow={onRunNow}
        onStop={() => {}}
        onToggleEnabled={onToggleEnabled}
        onOpen={() => {}}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
  });

const runNow = () => host.querySelector<HTMLButtonElement>('button[aria-label="Run now"]');
const onOff = () => host.querySelector<HTMLButtonElement>('button[role="switch"]');

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

describe("JobRow", () => {
  it("doesn't offer Run now while a question holds the automation", async () => {
    await show({ asks: [question()] });
    expect(runNow()?.disabled).toBe(true);
    expect(runNow()?.title).toBe("Answer or skip its question first");
    act(() => runNow()!.click());
    expect(onRunNow).not.toHaveBeenCalled();
  });

  it("runs while a question filed under a key waits, since that holds nothing", async () => {
    await show({ asks: [question({ key: "chat-482" })] });
    expect(runNow()?.disabled).toBe(false);
    act(() => runNow()!.click());
    expect(onRunNow).toHaveBeenCalledWith("triage");
  });

  it("has no on/off switch on a Manual automation that is on", async () => {
    await show({ schedule: { mode: "manual" } });
    expect(onOff()).toBeNull();
  });

  it("keeps the switch on a Manual automation that is off, to turn it back on", async () => {
    await show({ schedule: { mode: "manual" }, enabled: false });
    act(() => onOff()!.click());
    expect(onToggleEnabled).toHaveBeenCalledWith("triage", true);
  });

  it("keeps the switch on a scheduled automation", async () => {
    await show({ schedule: { mode: "interval", everySecs: 300 } });
    expect(onOff()).not.toBeNull();
  });
});
