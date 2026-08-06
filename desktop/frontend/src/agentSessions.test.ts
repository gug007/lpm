import { describe, expect, it } from "vitest";
import {
  filterByProvider,
  groupByDay,
  mergeSessionRows,
  resumeCmdFor,
  type AgentSessionSummary,
} from "./agentSessions";
import type { PersistedHistoryEntry } from "./terminals";

const CLAUDE_ID = "4bd82b0f-c9a4-493f-9985-a976099768d4";
const CODEX_ID = "019fd72d-52f2-73c0-9056-5ed4749ae4e6";

function session(overrides: Partial<AgentSessionSummary> = {}): AgentSessionSummary {
  return {
    provider: "claude",
    sessionId: CLAUDE_ID,
    title: "Resume picker",
    preview: "improve the resume session UI",
    updatedAt: 3_000,
    gitBranch: "main",
    ...overrides,
  };
}

function historyEntry(overrides: Partial<PersistedHistoryEntry> = {}): PersistedHistoryEntry {
  return {
    label: "Claude",
    resumeCmd: `claude --resume ${CLAUDE_ID}`,
    closedAt: 1_000,
    ...overrides,
  };
}

const merge = (input: Partial<Parameters<typeof mergeSessionRows>[0]>) =>
  mergeSessionRows({ history: [], sessions: [], open: new Map(), search: "", ...input });

describe("mergeSessionRows", () => {
  it("keeps one row when a closed tab and a stored session are the same conversation", () => {
    const rows = merge({
      history: [historyEntry({ actionName: "agent", label: "Feature work" })],
      sessions: [session()],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Resume picker");
    // Relaunching uses what lpm recorded, so the action's env comes back with it.
    expect(rows[0].actionName).toBe("agent");
    expect(rows[0].remembered).toBe(true);
    // The store knows when it last ran; the close time is older.
    expect(rows[0].updatedAt).toBe(3_000);
  });

  it("builds a resume command for a session lpm never launched", () => {
    const rows = merge({ sessions: [session({ provider: "codex", sessionId: CODEX_ID })] });

    expect(rows[0].resumeCmd).toBe(`codex resume ${CODEX_ID}`);
    expect(rows[0].remembered).toBe(false);
  });

  it("keeps a closed tab whose command carries no session id", () => {
    const rows = merge({
      history: [historyEntry({ resumeCmd: "aider --restore", label: "Aider" })],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBeNull();
    expect(rows[0].resumeCmd).toBe("aider --restore");
  });

  it("marks a conversation that is already open in a tab", () => {
    const rows = merge({
      sessions: [session()],
      open: new Map([[CLAUDE_ID, "term-7"]]),
    });

    expect(rows[0].openInTerminalId).toBe("term-7");
  });

  it("sorts newest first across both sources", () => {
    const rows = merge({
      history: [historyEntry({ resumeCmd: "aider --restore", closedAt: 2_000 })],
      sessions: [
        session({ sessionId: CODEX_ID, provider: "codex", updatedAt: 1_500 }),
        session({ updatedAt: 5_000 }),
      ],
    });

    expect(rows.map((row) => row.updatedAt)).toEqual([5_000, 2_000, 1_500]);
  });

  it("falls back to the prompt, then the tab name, for a session with no title", () => {
    const untitled = merge({ sessions: [session({ title: null })] });
    expect(untitled[0].title).toBe("improve the resume session UI");

    const bare = merge({
      history: [historyEntry({ label: "Tab 3" })],
      sessions: [session({ title: null, preview: null })],
    });
    expect(bare[0].title).toBe("Tab 3");
  });

  it("keeps a name the user gave the tab ahead of the agent's title", () => {
    const rows = merge({
      history: [
        historyEntry({
          sessionTitle: "Ship the picker",
          sessionTitleId: CLAUDE_ID,
          sessionTitleSource: "manual",
        }),
      ],
      sessions: [session({ title: "Resume picker" })],
    });

    expect(rows[0].title).toBe("Ship the picker");
    expect(rows[0].sessionTitleSource).toBe("manual");
  });

  it("searches titles, prompts and branches", () => {
    const sessions = [
      session({ title: "Resume picker", preview: "one", gitBranch: "main" }),
      session({ sessionId: CODEX_ID, provider: "codex", title: "Website copy", preview: "two", gitBranch: "feat/seo" }),
    ];

    expect(merge({ sessions, search: "picker" }).map((row) => row.title)).toEqual(["Resume picker"]);
    expect(merge({ sessions, search: "two" }).map((row) => row.provider)).toEqual(["codex"]);
    expect(merge({ sessions, search: "feat/" })[0].provider).toBe("codex");
    expect(merge({ sessions, search: "  RESUME  " })).toHaveLength(1);
    expect(merge({ sessions, search: "nothing" })).toHaveLength(0);
  });

  it("never matches a search through text the row does not show", () => {
    // `label` is the agent's own name for a stored session — typing it used to
    // match every row while looking like a title hit.
    const rows = merge({
      history: [historyEntry({ label: "Claude" })],
      sessions: [session({ title: "Resume picker", preview: "one" })],
      search: "claude",
    });

    expect(rows).toHaveLength(0);
    expect(merge({ sessions: [session({ title: "Claude prompt fix" })], search: "claude" })).toHaveLength(1);
  });

  it("drops rows the user hid", () => {
    const sessions = [session(), session({ sessionId: CODEX_ID, provider: "codex" })];
    const rows = merge({ sessions, hidden: new Set([`claude:${CLAUDE_ID}`]) });

    expect(rows.map((row) => row.provider)).toEqual(["codex"]);
  });

  it("strips the placeholder a pasted image leaves in the prompt", () => {
    const rows = merge({
      sessions: [session({ title: "[Image #1]review this", preview: "[Image #1]review this screen" })],
    });

    expect(rows[0].title).toBe("review this");
    expect(rows[0].preview).toBe("review this screen");
  });

  it("names a prompt that was nothing but an image", () => {
    const rows = merge({ sessions: [session({ title: null, preview: "[Image #1]" })] });

    expect(rows[0].title).toBe("Image prompt");
  });

  it("never shows the command a closed tab was launched with", () => {
    const bare = merge({ history: [historyEntry({ resumeCmd: "aider --restore", startCmd: "aider" })] });
    expect(bare[0].preview).toBe("");

    const ran = merge({
      history: [historyEntry({ resumeCmd: "aider --restore", startCmd: "aider", actionName: "agent" })],
    });
    expect(ran[0].preview).toBe("Ran agent");
  });

  it("records where each title came from", () => {
    const named = merge({
      history: [historyEntry({ sessionTitle: "Ship the picker", sessionTitleSource: "manual" })],
      sessions: [session()],
    });
    expect(named[0].titleOrigin).toBe("named");

    expect(merge({ sessions: [session()] })[0].titleOrigin).toBe("named");
    expect(merge({ sessions: [session({ title: null })] })[0].titleOrigin).toBe("prompt");

    const fallback = merge({
      history: [historyEntry({ label: "Tab 3" })],
      sessions: [session({ title: null, preview: null })],
    });
    expect(fallback[0].titleOrigin).toBe("tab");
    expect(merge({ history: [historyEntry({ resumeCmd: "aider --restore" })] })[0].titleOrigin).toBe("tab");
  });

  it("marks which rows a transcript backs", () => {
    expect(merge({ sessions: [session()] })[0].storeBacked).toBe(true);
    expect(merge({ history: [historyEntry({ resumeCmd: "aider --restore" })] })[0].storeBacked).toBe(
      false,
    );
  });

  it("falls back to the close time when the store reports no timestamp", () => {
    const rows = merge({ history: [historyEntry()], sessions: [session({ updatedAt: 0 })] });

    expect(rows[0].updatedAt).toBe(1_000);
  });

  it("does not let one closed tab claim two stored sessions", () => {
    const rows = merge({
      history: [historyEntry(), historyEntry({ closedAt: 900 })],
      sessions: [session(), session({ sessionId: CODEX_ID, provider: "codex" })],
    });

    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.remembered)).toHaveLength(1);
  });
});

describe("resumeCmdFor", () => {
  it("uses each agent's own resume syntax", () => {
    expect(resumeCmdFor(session())).toBe(`claude --resume ${CLAUDE_ID}`);
    expect(resumeCmdFor(session({ provider: "codex", sessionId: CODEX_ID }))).toBe(
      `codex resume ${CODEX_ID}`,
    );
  });
});

describe("filterByProvider", () => {
  it("narrows to one agent and keeps everything otherwise", () => {
    const rows = merge({
      history: [historyEntry({ resumeCmd: "aider --restore" })],
      sessions: [session(), session({ sessionId: CODEX_ID, provider: "codex" })],
    });

    expect(filterByProvider(rows, "all")).toHaveLength(3);
    expect(filterByProvider(rows, "claude")).toHaveLength(1);
    expect(filterByProvider(rows, "codex")).toHaveLength(1);
  });
});

describe("groupByDay", () => {
  const now = new Date("2026-08-06T15:00:00").getTime();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const at = (ms: number) => merge({ sessions: [session({ updatedAt: ms })] })[0];

  it("labels buckets relative to today", () => {
    const groups = groupByDay(
      [
        at(now - 3_600_000),
        at(startOfToday - 3_600_000),
        at(startOfToday - 3 * 86_400_000),
        at(startOfToday - 10 * 86_400_000),
        at(new Date("2025-11-02T10:00:00").getTime()),
      ],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Earlier this week",
      "Earlier this month",
      "November 2025",
    ]);
  });

  it("buckets a session with no timestamp instead of dating it to 1970", () => {
    const groups = groupByDay([at(0)], now);

    expect(groups.map((group) => group.label)).toEqual(["Older"]);
  });

  it("keeps consecutive rows of the same day together", () => {
    const groups = groupByDay([at(now), at(now - 60_000), at(startOfToday - 60_000)], now);

    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(2);
  });
});
