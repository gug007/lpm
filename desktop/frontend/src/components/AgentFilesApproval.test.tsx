// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCopyRequest, AgentFilesRequest, AgentRunRequest } from "../peer/agentFilesWords";

const mocks = vi.hoisted(() => ({
  requests: [] as AgentFilesRequest[],
  answer: vi.fn((_id: string, _decision: string) => Promise.resolve()),
}));

vi.mock("../../bridge/commands", () => ({
  PeerAgentRequests: vi.fn(() => Promise.resolve(mocks.requests)),
  PeerAgentAnswer: mocks.answer,
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));

import { AgentFilesApproval } from "./AgentFilesApproval";

const request = (over: Partial<AgentCopyRequest> = {}): AgentCopyRequest => ({
  id: "r1",
  kind: "copy",
  machine: "Studio",
  pulling: true,
  from: "Studio:/Users/me/keys/upload.jks",
  to: "/Users/me/keys/upload.jks",
  files: 1,
  bytes: 2048,
  sensitive: [],
  replaces: false,
  agent: "Claude",
  project: "lpm",
  tabGrant: true,
  ...over,
});

const runRequest = (over: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
  id: "r1",
  kind: "run",
  machine: "Studio",
  command: "npm test -- --watch=false",
  cwd: "Studio:~/Projects/app",
  agent: "Claude",
  project: "lpm",
  tabGrant: true,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.answer.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

async function show(req: AgentFilesRequest) {
  mocks.requests = [req];
  await act(async () => {
    root.render(<AgentFilesApproval />);
  });
}

describe("AgentFilesApproval", () => {
  it("names who asks, what moves and where, and allows it for the tab", async () => {
    await show(request());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Let Claude in lpm copy 1 file from Studio?");
    expect(text).toContain("Studio:/Users/me/keys/upload.jks");
    expect(text).toContain("2 KB");
    act(() => button("Allow for this tab")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("r1", "tab");
  });

  it("offers only a single yes when the copy holds keys", async () => {
    await show(request({ sensitive: ["/Users/me/keys/upload.jks"], tabGrant: false }));
    expect(document.body.textContent).toContain("keys, credentials");
    expect(button("Allow for this tab")).toBeUndefined();
    act(() => button("Deny")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("r1", "deny");
  });

  it("shows the command, where it runs, and what a yes for the tab covers", async () => {
    await show(runRequest());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Let Claude in lpm run a command on Studio?");
    expect(text).toContain("npm test -- --watch=false");
    expect(text).toContain("Studio:~/Projects/app");
    expect(text).toContain("any command on Studio until the tab closes");
    expect(text).not.toContain("copy");
    act(() => button("Allow for this tab")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("r1", "tab");
  });

  it("says when a program outside lpm's terminals asks", async () => {
    await show(request({ agent: "", project: "", tabGrant: false, pulling: false, files: 3 }));
    expect(document.body.textContent).toContain(
      "Let a program outside lpm's terminals copy 3 files to Studio?",
    );
    act(() => button("Allow once")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("r1", "once");
  });
});
