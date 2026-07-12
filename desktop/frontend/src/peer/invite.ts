// A pairing invite packed into one copy-pasteable string, so a person can hand
// off "address + port + code" as a single token instead of typing three fields.
// Format: `lpm-pair:` + base64url(JSON { v:1, h:hosts, p:port, c:code }).

export interface PeerInvite {
  hosts: string[];
  port: number;
  code: string;
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
  const payload = JSON.stringify({ v: 1, h: invite.hosts, p: invite.port, c: invite.code });
  return PREFIX + toBase64Url(payload);
}

// Tolerant decode: trims surrounding whitespace/newlines and accepts the string
// with or without the `lpm-pair:` prefix — but ONLY if the payload decodes to a
// well-formed v:1 invite. Anything else returns null.
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
  if (o.v !== 1) return null;
  const hosts = Array.isArray(o.h) ? o.h.filter((x): x is string => typeof x === "string") : [];
  const port = typeof o.p === "number" && Number.isFinite(o.p) ? o.p : null;
  const code = typeof o.c === "string" ? o.c : null;
  if (hosts.length === 0 || port === null || !code) return null;

  return { hosts, port, code };
}
