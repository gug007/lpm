import {
  loadApnsConfig,
  sendPush,
  type ApnsEnv,
  type ApnsPushType,
} from "@/lib/apns";

export const runtime = "nodejs";

const TOKEN_RE = /^[0-9a-fA-F]{1,200}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BLOB_CHARS = 8 * 1024;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLog = new Map<string, number[]>();

function rateLimited(token: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [key, hits] of rateLog) {
    const kept = hits.filter((t) => t > cutoff);
    if (kept.length === 0) rateLog.delete(key);
    else rateLog.set(key, kept);
  }

  const hits = rateLog.get(token) ?? [];
  if (hits.length >= RATE_LIMIT_MAX) return true;
  hits.push(now);
  rateLog.set(token, hits);
  return false;
}

function isValidCollapseId(id: unknown): id is string {
  return typeof id === "string" && /^[\x21-\x7e]{1,64}$/.test(id);
}

function isValidBlob(blob: unknown): blob is string {
  return (
    typeof blob === "string" &&
    blob.length > 0 &&
    blob.length <= MAX_BLOB_CHARS &&
    BASE64_RE.test(blob)
  );
}

function badRequest(): Response {
  return Response.json({ ok: false, reason: "bad request" }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest();
  }

  if (!body || typeof body !== "object") return badRequest();
  const { token, env, blob, type, collapseId } = body as Record<string, unknown>;

  if (typeof token !== "string" || !TOKEN_RE.test(token)) return badRequest();
  if (env !== "production" && env !== "sandbox") return badRequest();
  if (!isValidBlob(blob)) return badRequest();
  if (type !== undefined && type !== "alert" && type !== "background") {
    return badRequest();
  }
  const pushType: ApnsPushType = type === "background" ? "background" : "alert";
  if (collapseId !== undefined && !isValidCollapseId(collapseId)) {
    return badRequest();
  }

  const config = loadApnsConfig();
  if (!config) {
    return Response.json(
      { ok: false, reason: "relay not configured" },
      { status: 503 },
    );
  }

  if (rateLimited(token)) {
    return Response.json({ ok: false, reason: "rate limited" }, { status: 429 });
  }

  const payload = JSON.stringify(
    pushType === "background"
      ? { aps: { "content-available": 1 }, blob }
      : {
          aps: {
            alert: { title: "lpm", body: "Activity on your Mac" },
            sound: "default",
            "mutable-content": 1,
          },
          blob,
        },
  );

  const result = await sendPush(
    env as ApnsEnv,
    token,
    payload,
    config,
    pushType,
    typeof collapseId === "string" ? collapseId : undefined,
  );
  if (!result) {
    return Response.json(
      { ok: false, reason: "apns unreachable" },
      { status: 502 },
    );
  }

  if (result.status === 200) {
    return Response.json({ ok: true });
  }

  if (
    result.status === 410 ||
    (result.status === 400 && result.reason === "BadDeviceToken")
  ) {
    return Response.json(
      { ok: false, status: 410, reason: "Unregistered" },
      { status: 410 },
    );
  }

  return Response.json(
    { ok: false, status: result.status, reason: result.reason },
    { status: 502 },
  );
}
