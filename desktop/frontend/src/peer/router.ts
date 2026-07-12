import type { ProjectInfo } from "../types";
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
  "load_claude_accounts",
  "save_claude_accounts",
  "remove_claude_account",
  "claude_accounts_status",
  "claude_account_usage",
  "start_claude_login",
  "vault_export_key",
  "vault_import_key",
  "get_platform",
  "get_version",
  // Terminal control ownership is contended LOCALLY between this Mac's windows
  // over the mirrored terminal, even for a peer-prefixed id; the host denies
  // these and resolves its own ownership from the peer's sub/claim instead.
  "terminal_claim_control",
  "terminal_present_control",
  "terminal_unpresent_control",
  "terminal_control_owner",
]);

export function isLocalOnlyCommand(cmd: string): boolean {
  return cmd.startsWith("peer_") || cmd.startsWith("remote_") || LOCAL_ONLY_EXACT.has(cmd);
}

// Commands whose result is a freshly created host terminal id that must be
// prefixed and then subscribed to.
export const START_TERMINAL_CMDS = new Set<string>([
  "start_terminal",
  "start_terminal_with_cwd_env",
  "start_terminal_for_restore",
  "start_terminal_for_config",
]);

// Global events forwarded from a host and re-emitted locally. Their payloads
// carry host identifiers that the shim translates before invoking callbacks.
export const GLOBAL_PEER_EVENTS = new Set<string>([
  "projects-changed",
  "status-changed",
  "git-changed",
  "ports-changed",
  "action-output",
  "action-done",
  "action-bg-output",
  "templates-changed",
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
  };
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
  // Duplicate commands return freshly created host project name(s); prefix them
  // so the client selects / marks / spawns against the id it can actually see.
  if (cmd === "duplicate_project" && typeof result === "string") {
    return prefixName(slug, result);
  }
  if (cmd === "duplicate_projects" && Array.isArray(result)) {
    return result.map((n) => (typeof n === "string" ? prefixName(slug, n) : n));
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
    default:
      // projects-changed, action-output, action-done, action-bg-output,
      // templates-changed carry no host identifier to translate.
      return payload;
  }
}
