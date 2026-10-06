// Lightweight path helpers used in terminal output handling and file viewers.
// We avoid `node:path` (browser bundle). Paths are POSIX on macOS and Linux. On
// Windows a local path may also be `C:\…`, `C:/…` or `\\server\share\…`, while
// one that starts with `/` (a paired host's marker, an MSYS `/c/…` path) keeps
// POSIX rules. Each helper takes `win` so tests can exercise both.

import { isPeerRoot, peerSlugOf, prefixRoot } from "./peer/markers";
import { isWindows } from "./platform";

const DRIVE_RE = /^[A-Za-z]:[\\/]/;
const UNC_ROOT_RE = /^\\\\[^\\/]+[\\/][^\\/]+[\\/]?/;
const MSYS_DRIVE_RE = /^\/([A-Za-z])(?=\/|$)/;
const MSYS_MOUNT_RE = /^\/(tmp|bin|lib)(?=\/|$)/;
const WIN_PROGRAM_EXT_RE = /\.(?:exe|cmd|bat)$/i;
// What Windows runs, rather than shows, when a file goes to its default app:
// programs, installers and shortcuts, and the scripts its own hosts execute.
const WIN_RUNS_BINARY_RE =
  /\.(?:exe|com|scr|pif|cpl|msi|msp|mst|lnk|chm|jar|appx|appxbundle|msix|msixbundle|diagcab)$/i;
const WIN_RUNS_SCRIPT_RE =
  /\.(?:bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|reg|msc|scf|url|sh|bash|py|pyw|pyz|pl|rb)$/i;

export const windowsRules = (p: string, win = isWindows) => win && !p.startsWith("/");

// `C:\`, `C:/`, `\\server\share\` — the part of a Windows path `..` can't leave.
function winRoot(p: string): string {
  return DRIVE_RE.exec(p)?.[0] ?? UNC_ROOT_RE.exec(p)?.[0] ?? "";
}

// The separator a Windows path is written with: backslash unless it only uses `/`.
function winSep(p: string): "\\" | "/" {
  return p.includes("/") && !p.includes("\\") ? "/" : "\\";
}

// Absolute from a filesystem root: `/…`, or `C:\…` and `\\server\…` on Windows.
export function isRootedPath(p: string, win = isWindows): boolean {
  return p.startsWith("/") || (win && (DRIVE_RE.test(p) || p.startsWith("\\\\")));
}

export function isAbsolutePath(p: string, win = isWindows): boolean {
  if (p.startsWith("/") || p === "~" || p.startsWith("~/")) return true;
  return win && (DRIVE_RE.test(p) || p.startsWith("\\\\") || p.startsWith("~\\"));
}

// Relative paths the backend builds from native ones (`src\a.ts` on Windows),
// in the forward-slash form git and the rest of the UI use.
export function toSlash(p: string, win = isWindows): string {
  return win ? p.replace(/\\/g, "/") : p;
}

// Returns rel as-is if absolute or tilde-prefixed (the Rust side expands `~/`),
// otherwise resolves it against base. Strips leading `./` segments. Empty
// base returns the cleaned relative path; empty relative returns base. When
// base is on a paired host, an absolute rel names a path on that same host, so
// it keeps the host's marker instead of pointing at this machine.
export function joinAbs(base: string, rel: string, win = isWindows): string {
  if (rel.startsWith("/") || rel.startsWith("~/")) {
    const slug = peerSlugOf(base);
    return slug && !isPeerRoot(rel) ? prefixRoot(slug, rel) : rel;
  }
  if (rel === "~") return rel;
  if (win && isAbsolutePath(rel, true)) return rel;
  if (windowsRules(base, win)) return joinWin(base, rel);
  let cleaned = rel;
  while (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  if (!base) return cleaned;
  if (!cleaned) return base;
  return base.endsWith("/") ? base + cleaned : base + "/" + cleaned;
}

function joinWin(base: string, rel: string): string {
  let cleaned = rel;
  while (cleaned.startsWith("./") || cleaned.startsWith(".\\")) cleaned = cleaned.slice(2);
  if (!base) return cleaned;
  if (!cleaned) return base;
  const sep = winSep(base);
  cleaned = cleaned.replace(/[\\/]/g, sep);
  return /[\\/]$/.test(base) ? base + cleaned : base + sep + cleaned;
}

// A child path of `dir`, written with the separator `dir` already uses.
export function joinPath(dir: string, name: string, win = isWindows): string {
  if (!windowsRules(dir, win)) return `${dir.replace(/\/+$/, "")}/${name}`;
  const sep = winSep(dir);
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name.replace(/[\\/]/g, sep)}`;
}

// Returns absPath relative to root when absPath sits under root; otherwise
// returns absPath unchanged. Empty root returns absPath unchanged. On Windows
// the comparison ignores case and separator style, and the result uses `/`.
export function relTo(absPath: string, root: string, win = isWindows): string {
  if (!root) return absPath;
  if (windowsRules(root, win)) {
    const fold = (s: string) => s.replace(/\\/g, "/").toLowerCase();
    const prefix = /[\\/]$/.test(root) ? root : root + "/";
    if (fold(absPath.slice(0, prefix.length)) !== fold(prefix)) return absPath;
    return absPath.slice(prefix.length).replace(/\\/g, "/");
  }
  const prefix = root.endsWith("/") ? root : root + "/";
  return absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
}

// Folds `.` and `..` segments out of a path the way the filesystem would read
// it. Never climbs above `/`, `~`, a drive or share root, or a paired host's
// marker, and leaves a leading `..` of a relative path in place.
export function normalizePath(p: string, win = isWindows): string {
  if (windowsRules(p, win)) return normalizeWin(p);
  const absolute = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") {
      out.push(seg);
      continue;
    }
    const top = out[out.length - 1];
    if (top !== undefined && top !== ".." && top !== "~" && !(absolute && out.length === 1 && top.startsWith("@peer-"))) {
      out.pop();
    } else if (!absolute || out.length > 0) {
      out.push(seg);
    }
  }
  return (absolute ? "/" : "") + out.join("/");
}

function normalizeWin(p: string): string {
  const root = winRoot(p);
  const sep = winSep(p);
  const out: string[] = [];
  for (const seg of p.slice(root.length).split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") {
      out.push(seg);
      continue;
    }
    const top = out[out.length - 1];
    if (top !== undefined && top !== ".." && top !== "~") out.pop();
    else if (!root || out.length > 0) out.push(seg);
  }
  const head = root ? root.replace(/[\\/]+$/, "").replace(/[\\/]/g, sep) + sep : "";
  return head + out.join(sep);
}

export function basename(p: string, win = isWindows): string {
  return (windowsRules(p, win) ? p.split(/[\\/]/) : p.split("/")).pop() ?? p;
}

// The last name in a path, ignoring trailing separators (`/a/app/` → `app`).
export function folderName(p: string, win = isWindows): string {
  return (windowsRules(p, win) ? p.split(/[\\/]/) : p.split("/")).filter(Boolean).pop() ?? "";
}

// The folder holding an absolute path: `/` for a top-level POSIX entry, the
// drive or share root for one on Windows.
export function dirname(p: string, win = isWindows): string {
  if (!windowsRules(p, win)) {
    const cut = p.lastIndexOf("/");
    return cut > 0 ? p.slice(0, cut) : "/";
  }
  const root = winRoot(p);
  const cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (root && cut < root.length) return root;
  return cut > 0 ? p.slice(0, cut) : root || "/";
}

// An absolute path as its filesystem root plus the rest in `/` form, so links
// in a file outside any project resolve against that root.
export function splitRoot(p: string, win = isWindows): { root: string; rest: string } {
  if (windowsRules(p, win)) {
    const root = winRoot(p);
    if (root) return { root, rest: toSlash(p.slice(root.length), true) };
  }
  return { root: "/", rest: relTo(p, "/", false) };
}

// Where Git Bash's own tree and its `/tmp` are on this machine.
export interface MsysMounts {
  root: string;
  tmp: string;
}

// MSYS spells `C:\Users` as `/c/Users`; Git Bash prints paths that way. Given
// its mounts, the rest of its tree maps too: `/tmp` is the user's temp folder,
// `/bin` and `/lib` are the ones under `/usr`, and everything else sits under
// the Git install.
export function fromMsysPath(p: string, mounts: MsysMounts | null = null): string {
  const m = MSYS_DRIVE_RE.exec(p);
  if (m) return underWin(`${m[1].toUpperCase()}:\\`, p.slice(m[0].length));
  if (p.startsWith("//")) return p.replace(/^\/+/, "\\\\").replace(/\//g, "\\");
  if (!mounts || !p.startsWith("/") || isPeerRoot(p)) return p;
  const mount = MSYS_MOUNT_RE.exec(p);
  if (!mount) return underWin(mounts.root, p);
  const rest = p.slice(mount[0].length);
  return mount[1] === "tmp"
    ? underWin(mounts.tmp, rest)
    : underWin(mounts.root, `/usr/${mount[1]}${rest}`);
}

function underWin(base: string, rest: string): string {
  const tail = rest.replace(/^\/+/, "").replace(/\//g, "\\");
  const head = base.replace(/[\\/]+$/, "");
  return tail || /^[A-Za-z]:$/.test(head) ? `${head}\\${tail}` : head;
}

// A link to a file Windows would run on open: a "binary" (program, installer,
// shortcut) or a "script". Never anything off Windows.
export function runsWhenOpened(p: string, win = isWindows): "binary" | "script" | null {
  if (!win) return null;
  if (WIN_RUNS_BINARY_RE.test(p)) return "binary";
  return WIN_RUNS_SCRIPT_RE.test(p) ? "script" : null;
}

// The path part of a URI naming a local file (`lpm-file://…`): POSIX paths
// already start with `/`; a Windows one becomes `/C:/…` so the URI keeps the
// whole path, extension included.
export function uriPath(absPath: string, win = isWindows): string {
  if (!windowsRules(absPath, win)) return absPath;
  const slashed = toSlash(absPath, true);
  return DRIVE_RE.test(absPath) ? `/${slashed}` : slashed;
}

// The program a command token runs (`/usr/local/bin/claude`, `claude.exe`).
export function commandName(token: string, win = isWindows): string {
  if (!win) return token.split("/").pop() ?? "";
  return basename(token, true).replace(WIN_PROGRAM_EXT_RE, "");
}
