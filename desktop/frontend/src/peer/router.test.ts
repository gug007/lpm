import { describe, it, expect } from "vitest";
import type { ProjectInfo } from "../types";
import {
  findAgreedSlug,
  stripArgs,
  translateResult,
  mergeProjectLists,
  translatePeerEventPayload,
  isLocalOnlyCommand,
  GLOBAL_PEER_EVENTS,
} from "./router";
import { isPeerMarked, prefixName, prefixRoot } from "./markers";

const A = "aaaaaaaa";
const B = "bbbbbbbb";

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    name: "p",
    session: "",
    root: "/root",
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    ...over,
  };
}

describe("findAgreedSlug", () => {
  it("returns null when no argument is marked", () => {
    expect(findAgreedSlug({ name: "local", cwd: "/x" })).toBeNull();
    expect(findAgreedSlug(undefined)).toBeNull();
  });

  it("finds the slug from a marked name or root", () => {
    expect(findAgreedSlug({ projectName: prefixName(A, "app") })).toBe(A);
    expect(findAgreedSlug({ cwd: prefixRoot(A, "/Users/dev/app") })).toBe(A);
  });

  it("scans one array level deep", () => {
    expect(findAgreedSlug({ names: [prefixName(A, "one"), prefixName(A, "two")] })).toBe(A);
  });

  it("throws when two arguments disagree on the peer", () => {
    expect(() => findAgreedSlug({ id: prefixName(A, "t"), cwd: prefixRoot(B, "/p") })).toThrow();
  });
});

describe("stripArgs", () => {
  it("strips markers from strings and arrays, leaving others intact", () => {
    const stripped = stripArgs({
      id: prefixName(A, "app-0"),
      cwd: prefixRoot(A, "/Users/dev/app"),
      data: "echo hi",
      names: [prefixName(A, "one"), "plain"],
      count: 3,
    });
    expect(stripped).toEqual({
      id: "app-0",
      cwd: "/Users/dev/app",
      data: "echo hi",
      names: ["one", "plain"],
      count: 3,
    });
  });
});

describe("translateResult", () => {
  it("marks a popup page's file as the host's", () => {
    const out = translateResult("action_popup", A, { html: "<p></p>", file: "/srv/app/page.html" }) as { file: string };
    expect(isPeerMarked(out.file)).toBe(true);
    expect(translateResult("action_popup", A, { html: "<p></p>" })).toEqual({ html: "<p></p>" });
  });

  it("prefixes the host terminal ids a project lists", () => {
    const out = translateResult("list_project_terminals", A, [
      { id: "app-1", label: "Claude Code", pinned: false },
    ]);
    expect(out).toEqual([{ id: prefixName(A, "app-1"), label: "Claude Code", pinned: false }]);
  });

  it("prefixes the open tab ids a project lists with its terminals", () => {
    const out = translateResult("list_project_terminals", A, {
      terminals: [{ id: "app-1", label: "Claude Code", pinned: false }],
      tabs: ["app-1", "app-2"],
    });
    expect(out).toEqual({
      terminals: [{ id: prefixName(A, "app-1"), label: "Claude Code", pinned: false }],
      tabs: [prefixName(A, "app-1"), prefixName(A, "app-2")],
    });
  });

  it("keeps tabs null when the host has not reported them", () => {
    const out = translateResult("list_project_terminals", A, { terminals: [], tabs: null });
    expect(out).toEqual({ terminals: [], tabs: null });
  });

  it("prefixes name, parentName, and root for list_projects", () => {
    const result = translateResult("list_projects", A, [
      proj({ name: "app", root: "/Users/dev/app" }),
      proj({ name: "app-1", parentName: "app", root: "/Users/dev/app-1" }),
    ]) as ProjectInfo[];
    expect(result[0].name).toBe(prefixName(A, "app"));
    expect(result[0].root).toBe(prefixRoot(A, "/Users/dev/app"));
    expect(result[1].parentName).toBe(prefixName(A, "app"));
    expect(result[1].root).toBe(prefixRoot(A, "/Users/dev/app-1"));
  });

  // A status entry names its pty by the host's id; tabs here are peer-marked. If
  // this isn't translated the badge silently never appears, while the sidebar
  // still lights (it reads only the value) — a bug that looks tab-specific.
  it("prefixes the pane a status entry belongs to", () => {
    const [p] = translateResult("list_projects", A, [
      proj({
        name: "app",
        statusEntries: [
          { key: "agent", value: "Waiting", paneID: "app-3", priority: 0, timestamp: 0 },
          { key: "svc", value: "Running", priority: 0, timestamp: 0 },
        ],
      }),
    ]) as ProjectInfo[];
    expect(p.statusEntries[0].paneID).toBe(prefixName(A, "app-3"));
    // No pane means project-wide: leave it alone rather than inventing an id.
    expect(p.statusEntries[1].paneID).toBeUndefined();
  });

  it("translates a single project for get_project", () => {
    const result = translateResult("get_project", A, proj({ name: "app", root: "/r" })) as ProjectInfo;
    expect(result.name).toBe(prefixName(A, "app"));
    expect(result.root).toBe(prefixRoot(A, "/r"));
  });

  it("prefixes the new name(s) returned by duplicate commands", () => {
    expect(translateResult("duplicate_project", A, "app-copy-1")).toBe(prefixName(A, "app-copy-1"));
    expect(translateResult("start_duplicate_project", A, "app-copy-1")).toBe(
      prefixName(A, "app-copy-1"),
    );
    expect(translateResult("duplicate_worktree_project", A, "app-copy-1")).toBe(
      prefixName(A, "app-copy-1"),
    );
    expect(translateResult("start_duplicate_worktree_project", A, "app-copy-1")).toBe(
      prefixName(A, "app-copy-1"),
    );
    expect(translateResult("duplicate_projects", A, ["app-1", "app-2"])).toEqual([
      prefixName(A, "app-1"),
      prefixName(A, "app-2"),
    ]);
  });

  it("prefixes the names a batch removal couldn't remove", () => {
    expect(translateResult("remove_projects", A, ["app-2"])).toEqual([prefixName(A, "app-2")]);
  });

  it("prefixes the name an adopted folder landed under", () => {
    expect(translateResult("create_project", A, { name: "app-2", existing: false })).toEqual({
      name: prefixName(A, "app-2"),
      existing: false,
    });
    // An older host answers with nothing; the caller falls back to the folder's name.
    expect(translateResult("create_project", A, null)).toBeNull();
  });

  it("passes other results through unchanged", () => {
    expect(translateResult("git_status", A, { clean: true })).toEqual({ clean: true });
    // start_terminal ids are prefixed by the route wiring, not the pure table.
    expect(translateResult("start_terminal", A, "app-0")).toBe("app-0");
  });
});

describe("mergeProjectLists", () => {
  it("appends each peer list after the local list", () => {
    const local = [proj({ name: "local" })];
    const peer = [proj({ name: prefixName(A, "remote") })];
    expect(mergeProjectLists(local, [peer]).map((p) => p.name)).toEqual([
      "local",
      prefixName(A, "remote"),
    ]);
    expect(mergeProjectLists(local, []).map((p) => p.name)).toEqual(["local"]);
  });
});

describe("translatePeerEventPayload", () => {
  it("prefixes the project name for status-, ports- and terminals-changed", () => {
    expect(translatePeerEventPayload("status-changed", A, "app")).toBe(prefixName(A, "app"));
    expect(translatePeerEventPayload("ports-changed", A, "app")).toBe(prefixName(A, "app"));
    expect(translatePeerEventPayload("terminals-changed", A, "app")).toBe(prefixName(A, "app"));
  });

  it("prefixes the project root for git-changed and keeps files", () => {
    const out = translatePeerEventPayload("git-changed", A, {
      path: "/Users/dev/app",
      files: ["a.ts"],
    });
    expect(out).toEqual({ path: prefixRoot(A, "/Users/dev/app"), files: ["a.ts"] });
  });

  it("passes identifier-free payloads through", () => {
    expect(translatePeerEventPayload("projects-changed", A, null)).toBeNull();
    expect(translatePeerEventPayload("action-output", A, { line: "x" })).toEqual({ line: "x" });
  });

  it("prefixes the project name for clone-done and keeps ok/error", () => {
    expect(translatePeerEventPayload("clone-done", A, { name: "app", ok: true, error: null })).toEqual(
      { name: prefixName(A, "app"), ok: true, error: null },
    );
    expect(
      translatePeerEventPayload("clone-done", A, { name: "app", ok: false, error: "boom" }),
    ).toEqual({ name: prefixName(A, "app"), ok: false, error: "boom" });
  });

  it("leaves a malformed clone-done payload untouched", () => {
    expect(translatePeerEventPayload("clone-done", A, { ok: true })).toEqual({ ok: true });
  });

  it("prefixes the project name for duplicate-done and keeps ok/error", () => {
    expect(
      translatePeerEventPayload("duplicate-done", A, { name: "app-copy-1", ok: true, error: null }),
    ).toEqual({ name: prefixName(A, "app-copy-1"), ok: true, error: null });
    expect(
      translatePeerEventPayload("duplicate-done", A, { name: "app-copy-1", ok: false, error: "boom" }),
    ).toEqual({ name: prefixName(A, "app-copy-1"), ok: false, error: "boom" });
  });

  it("leaves a malformed duplicate-done payload untouched", () => {
    expect(translatePeerEventPayload("duplicate-done", A, { ok: true })).toEqual({ ok: true });
  });

  // A peer tab's id is the host's pty id with the marker, so an untranslated pane
  // matches no tab and the tab never learns which conversation to resume.
  it("prefixes the project and pane of an agent-session event", () => {
    expect(
      translatePeerEventPayload("agent-session", A, {
        project: "app",
        paneId: "app-3",
        provider: "claude",
        sessionId: "abc-123",
      }),
    ).toEqual({
      project: prefixName(A, "app"),
      paneId: prefixName(A, "app-3"),
      provider: "claude",
      sessionId: "abc-123",
    });
  });

  // Without it a peer tab whose agent was quit resumes that conversation again.
  it("prefixes the project and pane of an agent-session-ended event", () => {
    expect(
      translatePeerEventPayload("agent-session-ended", A, {
        project: "app",
        paneId: "app-3",
        sessionId: "abc-123",
      }),
    ).toEqual({ project: prefixName(A, "app"), paneId: prefixName(A, "app-3"), sessionId: "abc-123" });
  });

  it("leaves a malformed agent-session payload untouched", () => {
    expect(translatePeerEventPayload("agent-session", A, { project: "app" })).toEqual({
      project: "app",
    });
    expect(translatePeerEventPayload("agent-session", A, null)).toBeNull();
  });
});

describe("a host's automations", () => {
  const SLUG = "abcdef12";

  it("marks a host's job rows and stamps the machine on them", () => {
    const rows = translateResult("list_all_jobs", SLUG, [
      { id: "lint", project: "web", targets: ["web"] },
      { id: "nightly", source: "global", targets: ["web", "api"] },
      { id: "digest", source: "global", targets: [], standalone: true },
    ]);
    expect(rows).toEqual([
      { id: "lint", host: SLUG, project: prefixName(SLUG, "web"), targets: [prefixName(SLUG, "web")] },
      {
        id: "nightly",
        source: "global",
        host: SLUG,
        targets: [prefixName(SLUG, "web"), prefixName(SLUG, "api")],
      },
      { id: "digest", source: "global", host: SLUG, targets: [], standalone: true },
    ]);
  });

  it("marks the project a host's job is waiting in, so its answer goes there", () => {
    const [row] = translateResult("list_jobs", SLUG, [
      { id: "deploy", project: "web", ask: { id: "a1", status: "open", project: "web", at: 5 } },
    ]) as { ask: { project: string; at: number } }[];
    expect(row.ask).toEqual({ id: "a1", status: "open", project: prefixName(SLUG, "web"), at: 5 });
  });

  it("marks the project of every question a host's job waits on", () => {
    const [row] = translateResult("list_jobs", SLUG, [
      {
        id: "replies",
        project: "web",
        asks: [
          { id: "k1", key: "tg:1", status: "open", project: "web" },
          { id: "k2", key: "tg:2", status: "open", project: "api" },
        ],
      },
    ]) as { asks: { project: string }[] }[];
    expect(row.asks.map((a) => a.project)).toEqual([prefixName(SLUG, "web"), prefixName(SLUG, "api")]);
  });

  it("marks the copy a run worked in, so it opens here", () => {
    expect(
      translateResult("job_history", SLUG, [{ at: 1, result: "completed", copy: "web-2" }, { at: 2, result: "quiet" }]),
    ).toEqual([
      { at: 1, result: "completed", copy: prefixName(SLUG, "web-2") },
      { at: 2, result: "quiet" },
    ]);
  });

  it("marks where a host's live run is and where it carries on", () => {
    const [row] = translateResult("list_jobs", SLUG, [
      { id: "lint", runningIn: "web-2", takeOverIn: "web", runningInName: "UAI-1" },
    ]) as Record<string, unknown>[];
    expect(row.runningIn).toBe(prefixName(SLUG, "web-2"));
    expect(row.takeOverIn).toBe(prefixName(SLUG, "web"));
    expect(row.runningInName).toBe("UAI-1");

    const session = { sourceProject: "web-2", sessionId: "a" };
    const task = { kind: "fork", command: "claude --resume a", label: "Lint", claudeSession: session };
    expect(translateResult("take_over_job_run", SLUG, { project: "web-2", task })).toEqual({
      project: prefixName(SLUG, "web-2"),
      task: { ...task, claudeSession: { ...session, sourceProject: prefixName(SLUG, "web-2") } },
    });
  });

  it("forwards and marks a host's automation events", () => {
    expect(GLOBAL_PEER_EVENTS.has("job-status")).toBe(true);
    expect(GLOBAL_PEER_EVENTS.has("job-seen")).toBe(true);
    expect(
      translatePeerEventPayload("job-status", SLUG, { project: "web", jobId: "lint", copy: "web-2" }),
    ).toEqual({ project: prefixName(SLUG, "web"), jobId: "lint", copy: prefixName(SLUG, "web-2") });
    expect(translatePeerEventPayload("job-seen", SLUG, {})).toEqual({});
  });

  it("forwards and marks a host's SSH ports forwarding on their own", () => {
    expect(GLOBAL_PEER_EVENTS.has("port-auto-forwarded")).toBe(true);
    expect(GLOBAL_PEER_EVENTS.has("port-forward-failed")).toBe(true);
    expect(
      translatePeerEventPayload("port-auto-forwarded", SLUG, { project: "api", remotePort: 3000, localPort: 3001 }),
    ).toEqual({ project: prefixName(SLUG, "api"), remotePort: 3000, localPort: 3001 });
  });
});

describe("a host project's files", () => {
  const SLUG = "abcdef12";

  it("names a project a config save renamed as this Mac lists it", () => {
    expect(translateResult("save_config", SLUG, "web-renamed")).toBe(prefixName(SLUG, "web-renamed"));
  });

  it("marks the host's memory folder", () => {
    expect(
      translateResult("read_memory_sessions", SLUG, { dir: "/Users/them/.lpm/memory/web", sessions: [] }),
    ).toEqual({ dir: prefixRoot(SLUG, "/Users/them/.lpm/memory/web"), sessions: [] });
  });

  // The Toolkit reads, saves and opens a skill by its path, which must reach the host.
  it("marks the host paths of its agent skills and settings", () => {
    const skill = "/Users/them/.claude/skills/x/SKILL.md";
    const listed = translateResult("list_agent_capabilities", SLUG, {
      items: [{ id: "x", path: skill }],
      roots: [{ cli: "claude", path: "/Users/them/.claude/skills" }, { cli: "codex", path: "" }],
      remote: false,
    });
    expect(listed).toEqual({
      items: [{ id: "x", path: prefixRoot(SLUG, skill) }],
      roots: [{ cli: "claude", path: prefixRoot(SLUG, "/Users/them/.claude/skills") }, { cli: "codex", path: "" }],
      remote: false,
    });
    expect(translateResult("create_agent_skill", SLUG, skill)).toBe(prefixRoot(SLUG, skill));
    expect(translateResult("read_agent_capability", SLUG, { path: skill, content: "" })).toEqual({
      path: prefixRoot(SLUG, skill),
      content: "",
    });
  });

  it("marks an other skill's host path, so the viewer and Agent setup reach it", () => {
    const theirs = "/Users/them/web/.claude/skills/deploy/SKILL.md";
    const lists = { global: { folders: [], commands: [] }, project: { folders: [], commands: [], others: [{ name: "deploy", path: theirs }] }, projectError: null };
    const marked = translateResult("list_lpm_commands", SLUG, lists) as typeof lists;
    expect(marked.project.others[0].path).toBe(prefixRoot(SLUG, theirs));
  });

  it("leaves a list without other skills as an older host sends it", () => {
    const lists = { global: { folders: [], commands: [] }, project: null, projectError: null };
    expect(translateResult("list_lpm_commands", SLUG, lists)).toEqual(lists);
  });

  // The viewer reads a skill's file on the host.
  it("marks the host paths of lpm skills in both lists", () => {
    const own = "/Users/them/web/.claude/skills/ship/SKILL.md";
    const mine = "/Users/them/.agents/skills/explain/SKILL.md";
    const lists = {
      global: { folders: [], commands: [{ name: "explain", path: mine }], others: [] },
      project: { folders: [], commands: [{ name: "ship", path: own }, { name: "old" }] },
      projectError: null,
    };
    const marked = {
      global: { folders: [], commands: [{ name: "explain", path: prefixRoot(SLUG, mine) }], others: [] },
      project: { folders: [], commands: [{ name: "ship", path: prefixRoot(SLUG, own) }, { name: "old" }] },
      projectError: null,
    };
    expect(translateResult("list_lpm_commands", SLUG, lists)).toEqual(marked);
    expect(translateResult("save_lpm_command", SLUG, lists)).toEqual(marked);
    expect(translateResult("import_lpm_commands", SLUG, { imported: 1, list: lists })).toEqual({
      imported: 1,
      list: marked,
    });
    expect(translateResult("list_lpm_commands", SLUG, { ...lists, project: null })).toEqual({
      ...marked,
      project: null,
    });
  });

  it("forwards the host's memory saves under the project's name here", () => {
    expect(GLOBAL_PEER_EVENTS.has("memory-changed")).toBe(true);
    expect(translatePeerEventPayload("memory-changed", SLUG, "web")).toBe(prefixName(SLUG, "web"));
  });

  it("names the host terminal a command ran in as its tab here", () => {
    expect(GLOBAL_PEER_EVENTS.has("terminal-command")).toBe(true);
    expect(translatePeerEventPayload("terminal-command", SLUG, { id: "web-3", command: "pnpm test", at: 5 })).toEqual({
      id: prefixName(SLUG, "web-3"),
      command: "pnpm test",
      at: 5,
    });
  });
});

describe("GLOBAL_PEER_EVENTS", () => {
  it("forwards agent-session so peer tabs keep their resume command", () => {
    expect(GLOBAL_PEER_EVENTS.has("agent-session")).toBe(true);
  });

  it("forwards agent-session-ended so a quit agent isn't resumed on a peer tab", () => {
    expect(GLOBAL_PEER_EVENTS.has("agent-session-ended")).toBe(true);
  });

  it("forwards terminals-changed so a host's new tab opens here", () => {
    expect(GLOBAL_PEER_EVENTS.has("terminals-changed")).toBe(true);
  });
});

describe("isLocalOnlyCommand", () => {
  // Sends to a peer terminal are recorded here, so clearing them must happen here too.
  it("keeps message history on this Mac", () => {
    expect(isLocalOnlyCommand("message_history_clear")).toBe(true);
    expect(isLocalOnlyCommand("message_history_add")).toBe(true);
  });

  it("never routes peer/remote transport or app-meta commands", () => {
    expect(isLocalOnlyCommand("peer_invoke")).toBe(true);
    expect(isLocalOnlyCommand("peer_term_attach")).toBe(true);
    expect(isLocalOnlyCommand("remote_state")).toBe(true);
    expect(isLocalOnlyCommand("tailnet_sign_in")).toBe(true);
    expect(isLocalOnlyCommand("save_settings")).toBe(true);
    expect(isLocalOnlyCommand("install_update")).toBe(true);
    expect(isLocalOnlyCommand("cancel_update")).toBe(true);
  });

  it("opens apps on this Mac even for a paired machine's path", () => {
    expect(isLocalOnlyCommand("open_in")).toBe(true);
    expect(isLocalOnlyCommand("open_file_in_editor")).toBe(true);
    expect(isLocalOnlyCommand("open_path_in_default_app")).toBe(true);
    expect(isLocalOnlyCommand("reveal_in_finder")).toBe(true);
  });

  it("saves a paired machine's file on the computer the person is at", () => {
    expect(isLocalOnlyCommand("download_project_file")).toBe(true);
    expect(isLocalOnlyCommand("cancel_file_download")).toBe(true);
  });

  it("opens a paired machine's project's window on this Mac", () => {
    expect(isLocalOnlyCommand("detach_project")).toBe(true);
    expect(isLocalOnlyCommand("attach_project")).toBe(true);
  });

  it("reads a paired machine's file from here, in chunks", () => {
    expect(isLocalOnlyCommand("notes_read_file_as_input")).toBe(true);
  });

  // A paired machine's project runs on that machine's login, not this Mac's.
  it("asks a paired machine which account its project uses", () => {
    expect(isLocalOnlyCommand("claude_limits_account")).toBe(false);
  });

  it("keeps terminal control ownership local even for a peer-prefixed id", () => {
    expect(isLocalOnlyCommand("terminal_claim_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_present_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_unpresent_control")).toBe(true);
    expect(isLocalOnlyCommand("terminal_control_owner")).toBe(true);
  });

  it("routes project-scoped commands", () => {
    expect(isLocalOnlyCommand("git_status")).toBe(false);
    expect(isLocalOnlyCommand("write_terminal")).toBe(false);
    expect(isLocalOnlyCommand("start_terminal")).toBe(false);
  });

  it("reads a paired machine's agent answers there, from its transcript", () => {
    expect(isLocalOnlyCommand("agent_last_answer")).toBe(false);
    expect(isLocalOnlyCommand("agent_recent_answers")).toBe(false);
    const args = { projectName: prefixName(A, "web"), provider: "claude", sessionId: "s-1" };
    expect(findAgreedSlug(args)).toBe(A);
    expect(stripArgs(args)).toEqual({ projectName: "web", provider: "claude", sessionId: "s-1" });
  });
});
