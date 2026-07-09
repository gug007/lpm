import { createSign } from "node:crypto";
import http2 from "node:http2";

export type ApnsEnv = "production" | "sandbox";

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  topic: string;
}

export interface ApnsResult {
  status: number;
  reason?: string;
}

const JWT_TTL_MS = 50 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const EXPIRATION_SECONDS = 6 * 60 * 60;

export function loadApnsConfig(): ApnsConfig | null {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  return {
    key: key.replace(/\\n/g, "\n"),
    keyId,
    teamId,
    topic: process.env.APNS_TOPIC || "cx.lpm.mobile",
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { value: string; issuedAt: number } | null = null;

function signProviderToken(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedToken && now - cachedToken.issuedAt < JWT_TTL_MS) {
    return cachedToken.value;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }),
  );
  const signingInput = `${header}.${claims}`;

  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: config.key, dsaEncoding: "ieee-p1363" });

  const value = `${signingInput}.${base64url(signature)}`;
  cachedToken = { value, issuedAt: now };
  return value;
}

export function sendPush(
  env: ApnsEnv,
  deviceToken: string,
  payload: string,
  config: ApnsConfig,
): Promise<ApnsResult | null> {
  return new Promise((resolve) => {
    let jwt: string;
    try {
      jwt = signProviderToken(config);
    } catch {
      resolve(null);
      return;
    }

    const authority =
      env === "production"
        ? "https://api.push.apple.com"
        : "https://api.sandbox.push.apple.com";

    const session = http2.connect(authority);
    let settled = false;

    const finish = (result: ApnsResult | null) => {
      if (settled) return;
      settled = true;
      session.close();
      resolve(result);
    };

    session.on("error", () => finish(null));

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + EXPIRATION_SECONDS),
      "content-type": "application/json",
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => finish(null));
    req.on("error", () => finish(null));

    let status = 0;
    let raw = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      if (raw) {
        try {
          reason = (JSON.parse(raw) as { reason?: string }).reason;
        } catch {}
      }
      finish({ status, reason });
    });

    req.end(payload);
  });
}
