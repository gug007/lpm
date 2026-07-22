// A pairing invite packed into one copy-pasteable string, so a person can hand
// off "address + port + code" as a single token instead of typing three fields.
// Format: `lpm-pair:` + base64url(JSON { v:2, h:hosts, p:port, c:code, f?:fp }).
//
// `f` is the host's TLS leaf fingerprint (hex sha256 of the cert DER). When present
// the joining Mac pins it during the pairing handshake, so the encrypted channel is
// verified up front rather than trusted on first use. v1 invites (no `f`) still
// parse — the peer connects and pins the leaf after the first successful auth.

export interface PeerInvite {
  hosts: string[];
  port: number;
  code: string;
  fp?: string;
}

const PREFIX = "lpm-pair:";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const binary = atob(b64 + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeInvite(invite: PeerInvite): string {
  const payload: Record<string, unknown> = {
    v: 2,
    h: invite.hosts,
    p: invite.port,
    c: invite.code,
  };
  if (invite.fp) payload.f = invite.fp;
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

// Tolerant decode: trims surrounding whitespace/newlines and accepts the string
// with or without the `lpm-pair:` prefix — but ONLY if the payload decodes to a
// well-formed v:1 or v:2 invite. Unknown fields are ignored; a v:2 invite without
// `f` decodes as unpinned. Anything else returns null.
export function decodeInvite(input: unknown): PeerInvite | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length).trim();
  if (!s) return null;

  const json = fromBase64Url(s);
  if (json === null) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  if (o.v !== 1 && o.v !== 2) return null;
  const hosts = Array.isArray(o.h) ? o.h.filter((x): x is string => typeof x === "string") : [];
  const port = typeof o.p === "number" && Number.isFinite(o.p) ? o.p : null;
  const code = typeof o.c === "string" ? o.c : null;
  if (hosts.length === 0 || port === null || !code) return null;

  const invite: PeerInvite = { hosts, port, code };
  if (typeof o.f === "string" && o.f) invite.fp = o.f;
  return invite;
}
