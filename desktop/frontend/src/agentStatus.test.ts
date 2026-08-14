import { describe, expect, it } from "vitest";
import {
  agentAmbient,
  agentStateOf,
  computeProjectStatus,
  providerMeta,
  statusProvider,
} from "./agentStatus";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type StatusEntry,
} from "./types";

const entry = (key: string, value: string, priority = 0): StatusEntry => ({
  key,
  value,
  priority,
  timestamp: 1_700_000_000_000,
  paneID: "%1",
});

function project(name: string, statusEntries: StatusEntry[] = []): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries,
    isRemote: false,
  };
}

describe("agentStateOf", () => {
  it("maps every raw status value, and anything else to idle", () => {
    expect(agentStateOf(STATUS_WAITING)).toBe("needs-you");
    expect(agentStateOf(STATUS_ERROR)).toBe("error");
    expect(agentStateOf(STATUS_RUNNING)).toBe("working");
    expect(agentStateOf(STATUS_DONE)).toBe("done");
    expect(agentStateOf("Compacting")).toBe("idle");
  });
});

describe("computeProjectStatus", () => {
  it("returns all-false with no className for an empty list", () => {
    expect(computeProjectStatus([])).toEqual({
      isDone: false,
      isWaiting: false,
      isError: false,
      className: null,
    });
  });

  it("treats a missing list like an empty one", () => {
    expect(computeProjectStatus(undefined)).toEqual(computeProjectStatus([]));
  });

  it("shimmers for a single running agent", () => {
    const status = computeProjectStatus([entry("claude_code_abc123", STATUS_RUNNING)]);
    expect(status).toEqual({
      isDone: false,
      isWaiting: false,
      isError: false,
      className: "sidebar-shimmer",
    });
  });

  it("marks Done without a className", () => {
    const status = computeProjectStatus([entry("codex_%3", STATUS_DONE)]);
    expect(status.isDone).toBe(true);
    expect(status.className).toBe(null);
  });

  it("lets Waiting outrank Running", () => {
    const status = computeProjectStatus([
      entry("claude_code_abc123", STATUS_RUNNING),
      entry("codex_%3", STATUS_WAITING),
    ]);
    expect(status.isWaiting).toBe(true);
    expect(status.className).toBe("sidebar-waiting");
  });

  it("lets Error outrank Waiting, Running and Done", () => {
    const status = computeProjectStatus([
      entry("claude_code_abc123", STATUS_DONE),
      entry("claude_code_def456", STATUS_RUNNING),
      entry("codex_%3", STATUS_WAITING),
      entry("codex_%4", STATUS_ERROR),
    ]);
    expect(status).toEqual({
      isDone: true,
      isWaiting: true,
      isError: true,
      className: "text-[var(--accent-red-text)]",
    });
  });

  it("prefers Running over Done for the className", () => {
    const status = computeProjectStatus([
      entry("claude_code_abc123", STATUS_DONE),
      entry("codex_%3", STATUS_RUNNING),
    ]);
    expect(status.className).toBe("sidebar-shimmer");
  });

  it("ignores unknown status values", () => {
    const status = computeProjectStatus([
      entry("build", "Compiling"),
      entry("deploy", ""),
    ]);
    expect(status).toEqual({
      isDone: false,
      isWaiting: false,
      isError: false,
      className: null,
    });
  });

  it("matches status values case-sensitively", () => {
    expect(computeProjectStatus([entry("codex_%3", "running")]).className).toBe(null);
  });

  it("does not care which agent reported the value", () => {
    const claude = computeProjectStatus([entry("claude_code_abc123", STATUS_WAITING)]);
    const codex = computeProjectStatus([entry("codex_%3", STATUS_WAITING)]);
    expect(claude).toEqual(codex);
  });
});

describe("agentAmbient", () => {
  it("counts nothing across projects with no agents", () => {
    expect(agentAmbient([project("app"), project("site", [])])).toEqual({
      needsYou: 0,
      hasError: false,
    });
  });

  it("adds up the agents waiting across every project", () => {
    const ambient = agentAmbient([
      project("app", [
        entry("claude_code_a", STATUS_WAITING),
        entry("codex_%3", STATUS_RUNNING),
      ]),
      project("site", [entry("claude_code_b", STATUS_WAITING)]),
    ]);
    expect(ambient).toEqual({ needsYou: 2, hasError: false });
  });

  it("flags a problem without counting it as waiting", () => {
    const ambient = agentAmbient([project("app", [entry("codex_%3", STATUS_ERROR)])]);
    expect(ambient).toEqual({ needsYou: 0, hasError: true });
  });
});

describe("providerMeta", () => {
  it("names each agent", () => {
    expect(providerMeta("claude").label).toBe("Claude Code");
    expect(providerMeta("codex").label).toBe("Codex");
  });

  it("falls back to a generic name for an unrecognised agent", () => {
    expect(providerMeta("unknown").label).toBe("Agent");
    expect(providerMeta("mystery").label).toBe("mystery");
  });
});

describe("statusProvider", () => {
  it("reads Claude from the session-keyed prefix", () => {
    expect(statusProvider("claude_code_0199f1e2-3a4b-7c8d-9e0f-1a2b3c4d5e6f")).toBe("claude");
  });

  it("reads Codex from the pane-keyed prefix", () => {
    expect(statusProvider("codex_%3")).toBe("codex");
  });

  it("falls back to unknown for a non-agent key", () => {
    expect(statusProvider("build")).toBe("unknown");
    expect(statusProvider("")).toBe("unknown");
  });

  it("requires the full prefix", () => {
    expect(statusProvider("claude_code")).toBe("unknown");
    expect(statusProvider("codex")).toBe("unknown");
    expect(statusProvider("my_codex_%3")).toBe("unknown");
  });
});
