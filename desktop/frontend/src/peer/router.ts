import type { ProjectInfo, StatusEntry } from "../types";
import { parsePeerMarker, prefixName, prefixRoot, stripMarker } from "./markers";

// Commands that must always run against the LOCAL lpm even when an argument
// looks marked: window/dock/mirror control, settings, tts, updater, account,
// vault, and the peer/remote transport commands themselves (their args, e.g.
// peer_term_attach's prefixed id, intentionally carry markers we must not
// strip). Everything else is project-scoped and safe to forward.
const LOCAL_ONLY_EXACT = new Set<string>([
  "focus_detached_window",
  "focus_main_window",
  "restore_detached_windows",
  "save_window_size",
  "load_settings",
  "save_settings",
  "start_tts",
  "stop_tts",
  "pause_tts",
  "resume_tts",
  "check_for_update",
  "install_update",
  "rollback_update",
  "cancel_update",
  "scheduled_update",
  "schedule_update",
  "cancel_scheduled_update",
  "take_update_note",
  "services_build",
  "restart_services",
  "load_claude_accounts",
  "save_claude_accounts",
  "remove_claude_account",
  "claude_accounts_status",
  "claude_account_usage",
  "claude_pool_state",
  "set_claude_pool",
  "accept_claude_pool_pick",
  "resume_claude_pool",
  "vault_export_key",
  "vault_import_key",
  "get_platform",
  "get_version",
  // A window opens on the Mac the person is at, a paired machine's project's too.
  "detach_project",
  "attach_project",
  // Terminal control ownership is contended LOCALLY between this Mac's windows
  // over the mirrored terminal, even for a peer-prefixed id; the host denies
  // these and resolves its own ownership from the peer's sub/claim instead.
  "terminal_claim_control",
  "terminal_present_control",
  "terminal_unpresent_control",
  "terminal_control_owner",
  // "Bring changes" always runs on the Mac that RECEIVES the work, and names the
  // source Mac in its arguments. Forwarding it would make the sender bring its
  // own changes to itself; the Rust side accepts marked or bare identifiers.
  "bring_changes_targets",
  "bring_changes_start",
  "bring_changes_cancel",
  // The send-later list and its clock live on this Mac even when a prompt is for
  // a peer's terminal: this Mac types it in when it comes due.
  "send_later_list",
  "send_later_add",
  "send_later_reschedule",
  "send_later_send_now",
  "send_later_remove",
  "notify_unattended",
  // An app opens where the person is. These take a paired machine's path and
  // handle it here: Remote-SSH, or a read-only copy fetched over the peer.
  "open_in",
  "open_file_in_editor",
  "open_path_in_default_app",
  "reveal_in_finder",
  // Reads a paired machine's file from here, a chunk at a time, so its size
  // isn't held to one frame of the peer connection.
  "notes_read_file_as_input",
]);

export function isLocalOnlyCommand(cmd: string): boolean {
  return (
    cmd.startsWith("peer_") ||
    cmd.startsWith("remote_") ||
    cmd.startsWith("tailnet_") ||
    // What was typed is kept on the Mac it was typed on, a peer terminal's too.
    cmd.startsWith("message_history_") ||
    // Syncing files with a paired computer runs here and reaches that computer
    // itself; the project and the other side's folder are separate arguments.
    cmd.startsWith("ignored_sync_") ||
    LOCAL_ONLY_EXACT.has(cmd)
  );
}

// Commands whose result is a freshly created host terminal id that must be
// prefixed and then subscribed to.
export const START_TERMINAL_CMDS = new Set<string>([
  "start_terminal",
  "start_terminal_with_cwd_env",
  "start_terminal_for_restore",
  "start_terminal_for_config",
  "start_claude_login",
]);

// Global events forwarded from a host and re-emitted locally. Their payloads
// carry host identifiers that the shim translates before invoking callbacks.
export const GLOBAL_PEER_EVENTS = new Set<string>([
  "projects-changed",
  "status-changed",
  "git-changed",
  "ports-changed",
  "port-auto-forwarded",
  "port-forward-failed",
  "action-output",
  "action-done",
  "action-bg-output",
  "templates-changed",
  "clone-done",
  "duplicate-done",
  "agent-session",
  "agent-session-ended",
  "terminal-command",
  "terminals-changed",
  "job-status",
  "job-seen",
  "memory-changed",
  // A coding agent's progress on a generation run on the host.
  "commit-msg-progress",
  "pr-title-progress",
  "pr-description-progress",
  "branch-name-progress",
  "merge-conflict-progress",
  "action-yaml-progress",
  "composer-transform-progress",
  "statusline-gen-progress",
  "ai-generate-output",
  "skill-gen-progress",
]);

// Scan a command's arguments (top level + one array level deep) for peer
// markers. Returns the single agreed slug, null when unmarked, or throws when
// two arguments disagree — a call can only target one peer.
export function findAgreedSlug(args: unknown): string | null {
  let slug: string | null = null;
  const consider = (value: unknown) => {
    const marker = parsePeerMarker(value);
    if (!marker) return;
    if (slug === null) slug = marker.slug;
    else if (slug !== marker.slug) {
      throw new Error("peer command targets more than one Mac");
    }
  };
  if (args && typeof args === "object") {
    for (const value of Object.values(args as Record<string, unknown>)) {
      if (Array.isArray(value)) value.forEach(consider);
      else consider(value);
    }
  }
  return slug;
}

// Deep-ish clone of args with every marked value (top level + one array level
// deep) replaced by its host-native identifier. Non-marked values pass through.
export function stripArgs(args: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!args || typeof args !== "object") return out;
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = stripMarker(value);
    else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === "string" ? stripMarker(v) : v));
    } else out[key] = value;
  }
  return out;
}

function translateProject(slug: string, p: ProjectInfo): ProjectInfo {
  return {
    ...p,
    name: prefixName(slug, p.name),
    // The prefixed name is a routing key, not something to read — keep the
    // human name in the label so headers and the sidebar stay clean.
    label: p.label || p.name,
    parentName: p.parentName ? prefixName(slug, p.parentName) : p.parentName,
    root: prefixRoot(slug, p.root),
    // A status entry names the pty it belongs to by the HOST's own id, while
    // every terminal here is peer-marked — so an untranslated paneID matches no
    // tab and the badge never appears. The sidebar lights anyway (it reads only
    // the value), which is exactly why this looked like a tab-only bug.
    statusEntries: prefixPanes(slug, p.statusEntries),
    seenEntries: prefixPanes(slug, p.seenEntries),
  };
}

function prefixPanes(slug: string, entries: StatusEntry[] | undefined): StatusEntry[] {
  return (entries ?? []).map((e) => (e.paneID ? { ...e, paneID: prefixName(slug, e.paneID) } : e));
}

// A host's job row: stamped with the machine it lives on, its projects marked.
// A standalone row keeps its empty targets; `host` is what routes it.
function translateJob(slug: string, row: unknown): unknown {
  if (!row || typeof row !== "object") return row;
  const job = row as { project?: unknown; targets?: unknown; ask?: { project?: unknown } };
  return {
    ...job,
    host: slug,
    ...(job.ask && typeof job.ask.project === "string"
      ? { ask: { ...job.ask, project: prefixName(slug, job.ask.project) } }
      : {}),
    ...(typeof job.project === "string" ? { project: prefixName(slug, job.project) } : {}),
    ...(Array.isArray(job.targets)
      ? { targets: job.targets.map((t) => (typeof t === "string" ? prefixName(slug, t) : t)) }
      : {}),
  };
}

function markPath(slug: string, entry: unknown): unknown {
  const path = entry && typeof entry === "object" ? (entry as { path?: unknown }).path : undefined;
  return typeof path === "string" && path ? { ...(entry as object), path: prefixRoot(slug, path) } : entry;
}

function markPaths(slug: string, list: unknown): unknown {
  return Array.isArray(list) ? list.map((entry) => markPath(slug, entry)) : list;
}

// Rewrite host identifiers in a routed command's result into their prefixed
// client-side form. Default is passthrough; start_terminal ids are handled by
// the caller (they also trigger an attach).
export function translateResult(cmd: string, slug: string, result: unknown): unknown {
  if (cmd === "list_projects") {
    const list = (result as ProjectInfo[] | null) ?? [];
    return list.map((p) => translateProject(slug, p));
  }
  if (cmd === "get_project" && result && typeof result === "object") {
    return translateProject(slug, result as ProjectInfo);
  }
  // Saving a config can rename the project; the answer is its name now.
  if (cmd === "save_config" && typeof result === "string" && result) {
    return prefixName(slug, result);
  }
  // The memory folder is the host's, and its name is the owner's name there.
  if (cmd === "read_memory_sessions" && result && typeof result === "object") {
    const r = result as { dir?: unknown };
    if (typeof r.dir === "string" && r.dir) return { ...result, dir: prefixRoot(slug, r.dir) };
  }
  if ((cmd === "list_all_jobs" || cmd === "list_jobs") && Array.isArray(result)) {
    return result.map((row) => translateJob(slug, row));
  }
  // A run that worked in a copy names it, for "Open copy".
  if (cmd === "job_history" && Array.isArray(result)) {
    return result.map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { copy?: unknown }).copy === "string"
        ? { ...entry, copy: prefixName(slug, (entry as { copy: string }).copy) }
        : entry,
    );
  }
  // The host's live terminals in a project, named by its own pty ids — and,
  // when asked `withTabs`, the ids of its open tabs alongside.
  if (cmd === "list_project_terminals") {
    const terminals = (list: unknown) =>
      Array.isArray(list)
        ? list.map((t) =>
            t && typeof t === "object" && typeof (t as { id?: unknown }).id === "string"
              ? { ...t, id: prefixName(slug, (t as { id: string }).id) }
              : t,
          )
        : list;
    if (Array.isArray(result)) return terminals(result);
    if (result && typeof result === "object") {
      const r = result as { terminals?: unknown; tabs?: unknown };
      return {
        ...r,
        terminals: terminals(r.terminals),
        tabs: Array.isArray(r.tabs)
          ? r.tabs.map((id) => (typeof id === "string" ? prefixName(slug, id) : id))
          : r.tabs,
      };
    }
  }
  // Agent skills and settings files are named by their host path, which the
  // Toolkit then reads, saves and opens — so those calls must reach the host.
  if (cmd === "list_agent_capabilities" && result && typeof result === "object") {
    const r = result as { items?: unknown; roots?: unknown };
    return {
      ...result,
      items: markPaths(slug, r.items),
      roots: markPaths(slug, r.roots),
    };
  }
  if (cmd === "read_agent_capability") return markPath(slug, result);
  if (cmd === "create_agent_skill" && typeof result === "string") return prefixRoot(slug, result);
  // Duplicate commands return freshly created host project name(s); prefix them
  // so the client selects / marks / spawns against the id it can actually see.
  if (
    (cmd === "duplicate_project" ||
      cmd === "start_duplicate_project" ||
      cmd === "duplicate_worktree_project" ||
      cmd === "start_duplicate_worktree_project") &&
    typeof result === "string"
  ) {
    return prefixName(slug, result);
  }
  // A batch duplicate answers with the copies' names, a batch removal with the
  // names it couldn't remove.
  if ((cmd === "duplicate_projects" || cmd === "remove_projects") && Array.isArray(result)) {
    return result.map((n) => (typeof n === "string" ? prefixName(slug, n) : n));
  }
  // Adopting a folder answers with the name it landed under (the folder's own
  // unless that was taken); an older host answers with nothing.
  if (cmd === "create_project" && result && typeof result === "object") {
    const r = result as { name?: unknown };
    if (typeof r.name === "string") return { ...result, name: prefixName(slug, r.name) };
  }
  return result;
}

export function mergeProjectLists(
  local: ProjectInfo[],
  peerLists: ProjectInfo[][],
): ProjectInfo[] {
  const merged = [...local];
  for (const list of peerLists) merged.push(...list);
  return merged;
}

// Translate the identifier fields inside a forwarded global-event payload so a
// client-side listener sees prefixed names/roots and reacts as if the event
// were local.
export function translatePeerEventPayload(
  name: string,
  slug: string,
  payload: unknown,
): unknown {
  switch (name) {
    case "status-changed":
    case "ports-changed":
    case "terminals-changed":
    case "memory-changed":
      // Payload is the bare project name.
      return typeof payload === "string" ? prefixName(slug, payload) : payload;
    case "git-changed":
      // { path: projectRoot, files: string[] | null }
      if (payload && typeof payload === "object") {
        const p = payload as { path?: unknown };
        if (typeof p.path === "string") {
          return { ...(payload as object), path: prefixRoot(slug, p.path) };
        }
      }
      return payload;
    case "clone-done":
    case "duplicate-done":
      // { name: hostProjectName, ok, error } — prefix the name so a client
      // waiting on its remote clone/duplicate matches on the id it can see.
      if (payload && typeof payload === "object") {
        const p = payload as { name?: unknown };
        if (typeof p.name === "string") {
          return { ...(payload as object), name: prefixName(slug, p.name) };
        }
      }
      return payload;
    case "port-auto-forwarded":
    case "port-forward-failed":
    case "job-status":
    case "job-seen":
      // { project, copy?, … } — the project ("" for a standalone job) and the
      // copy an automation ran in, as this Mac names them.
      if (payload && typeof payload === "object") {
        const p = payload as { project?: unknown; copy?: unknown };
        return {
          ...(payload as object),
          ...(typeof p.project === "string" ? { project: prefixName(slug, p.project) } : {}),
          ...(typeof p.copy === "string" ? { copy: prefixName(slug, p.copy) } : {}),
        };
      }
      return payload;
    case "agent-session":
    case "agent-session-ended":
      // { project, paneId, … } — a peer tab's id is the host's pty id prefixed,
      // so both names need the marker to find the tab here.
      if (payload && typeof payload === "object") {
        const p = payload as { project?: unknown; paneId?: unknown };
        if (typeof p.project === "string" && typeof p.paneId === "string") {
          return {
            ...(payload as object),
            project: prefixName(slug, p.project),
            paneId: prefixName(slug, p.paneId),
          };
        }
      }
      return payload;
    case "terminal-command":
      // { id, … } — the host's pty id, which a peer tab's id prefixes.
      if (payload && typeof payload === "object") {
        const p = payload as { id?: unknown };
        if (typeof p.id === "string") return { ...(payload as object), id: prefixName(slug, p.id) };
      }
      return payload;
    default:
      // projects-changed, action-output, action-done, action-bg-output,
      // templates-changed carry no host identifier to translate.
      return payload;
  }
}
