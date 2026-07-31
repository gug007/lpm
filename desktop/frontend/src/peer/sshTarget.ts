export interface SshTarget {
  host: string;
  user: string;
  port: number;
  key: string;
}

// What people type for a server is `user@host`, sometimes with a port. Accept
// that, rather than asking for three fields — it's the string they already have
// in their shell history.
//
// Deliberately NOT accepting `ssh://…` or a trailing path: this names a machine
// to connect to, and quietly ignoring the extra parts of something that looks
// like a URL would hide a typo rather than surface it.
export function parseSshTarget(input: string): SshTarget | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const at = trimmed.lastIndexOf("@");
  const user = at === -1 ? "" : trimmed.slice(0, at);
  let host = at === -1 ? trimmed : trimmed.slice(at + 1);
  if (at !== -1 && !user) return null;

  let port = 0;
  // Only a trailing `:digits` is a port. An IPv6 literal has colons throughout,
  // so anything else colon-bearing is left alone for ssh to interpret.
  const colon = host.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) {
    const parsed = Number(host.slice(colon + 1));
    if (parsed < 1 || parsed > 65535) return null;
    port = parsed;
    host = host.slice(0, colon);
  }
  if (!host || host.includes("/")) return null;

  return { host, user, port, key: "" };
}
