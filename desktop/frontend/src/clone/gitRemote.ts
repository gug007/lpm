import { slugify } from "../slugify";

export interface GitRemote {
  // What to clone: the text as copied, minus any query, fragment or trailing slash.
  url: string;
  // host/owner/repo, for showing.
  label: string;
}

// Forges whose repo URLs are exactly /owner/repo, so any other web page there
// isn't mistaken for one.
const OWNER_REPO_HOSTS = new Set(["github.com", "codeberg.org", "bitbucket.org", "gitea.com"]);
const NESTED_GROUP_HOSTS = new Set(["gitlab.com"]);
const GITHUB_PAGES = new Set([
  "about", "account", "apps", "codespaces", "collections", "customer-stories", "dashboard",
  "enterprise", "events", "explore", "features", "issues", "login", "marketplace", "new",
  "notifications", "orgs", "organizations", "pricing", "pulls", "readme", "resources", "search",
  "security", "settings", "site", "solutions", "sponsors", "team", "topics", "trending", "users",
]);

// What the desktop refuses in a clone URL (projects_crud validate_clone_url).
const REFUSED = /[`$;&|<>()\\"']/;
const URL_FORM = /^(https?|ssh|git):\/\/(?:([^@/\s]+)@)?([^/:?#\s]+)(?::\d+)?(\/[^?#]*)?(?:[?#].*)?$/i;
const SCP_FORM = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(?!\/\/)([^\s?#]+)$/;

export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[?#].*$/, "");
  if (!trimmed) return "";
  const tail = trimmed.replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  return slugify(tail.replace(/\.git$/i, ""));
}

function looksLikeRepo(scheme: string, host: string, segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? "";
  if (/.\.git$/i.test(last)) return true;
  if (OWNER_REPO_HOSTS.has(host)) {
    return segments.length === 2 && !(host === "github.com" && GITHUB_PAGES.has(segments[0].toLowerCase()));
  }
  if (NESTED_GROUP_HOSTS.has(host)) return segments.length >= 2 && !segments.includes("-");
  if (segments.length >= 3 && segments[segments.length - 2] === "_git") return true;
  return scheme !== "http" && scheme !== "https" && segments.length >= 2;
}

function labelOf(host: string, segments: string[]): string {
  return `${host}/${segments.join("/")}`.replace(/\.git$/i, "");
}

function fromUrlForm(raw: string): GitRemote | null {
  const m = URL_FORM.exec(raw);
  if (!m) return null;
  const [, rawScheme, user, rawHost, path = ""] = m;
  // A password in the URL is a secret, not something to put on screen.
  if (user?.includes(":")) return null;
  const scheme = rawScheme.toLowerCase();
  const host = rawHost.toLowerCase();
  if (!host.includes(".") && host !== "localhost") return null;
  const segments = path.split("/").filter(Boolean);
  if (!segments.length || !looksLikeRepo(scheme, host, segments)) return null;
  const url = raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return { url, label: labelOf(host, segments) };
}

function fromScpForm(raw: string): GitRemote | null {
  const m = SCP_FORM.exec(raw);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const segments = m[2].split("/").filter(Boolean);
  if (!segments.length) return null;
  const last = segments[segments.length - 1];
  const repoish = /.\.git$/i.test(last) || (host.includes(".") && segments.length >= 2);
  if (!repoish) return null;
  return { url: raw.replace(/\/+$/, ""), label: labelOf(host, segments) };
}

// A Git remote, if that's what the text is: https://host/owner/repo(.git),
// ssh://…, git://…, or git@host:owner/repo.git.
export function parseGitRemote(text: string): GitRemote | null {
  const raw = text.trim();
  if (!raw || raw.length > 1000 || /\s/.test(raw) || REFUSED.test(raw)) return null;
  return fromUrlForm(raw) ?? fromScpForm(raw);
}

// The host a clone URL points at, or "" when there's none to read.
export function remoteHost(url: string): string {
  const raw = url.trim();
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/:?#\s]+)/i.exec(raw) ?? /^[^@\s/]+@([^:/\s]+):/.exec(raw);
  return m ? m[1].toLowerCase() : "";
}
