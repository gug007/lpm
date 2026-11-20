import { parsePing, utcDay } from "./ping";
import { COUNT_PING } from "./queries";

interface Env {
  DB: D1Database;
  PINGS?: RateLimit;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/ping") return reply(404);
    if (request.method !== "GET") return reply(405);
    const today = utcDay(new Date());
    const ping = parsePing(url.searchParams, today);
    if (!ping) return reply(400);
    // The address only keys the rate limit for a minute; it is never stored.
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    if (env.PINGS && !(await env.PINGS.limit({ key: ip })).success) return reply(429);
    await env.DB.prepare(COUNT_PING)
      .bind(today, ping.version, ping.os, ping.arch, ping.kind, ping.cohort, ping.weekly, ping.monthly, ping.installs)
      .run();
    return reply(204);
  },
} satisfies ExportedHandler<Env>;

function reply(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}
