export function relativeTime(unix: number): string {
  if (!unix) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

// relativeTime as a phrase: "just now", "5m ago".
export function relativeAgo(unix: number): string {
  const t = relativeTime(unix);
  if (!t) return "";
  return t === "now" ? "just now" : `${t} ago`;
}

const STAMP = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function shortStamp(ms: number): string {
  return ms > 0 ? STAMP.format(new Date(ms)) : "";
}

const FULL_STAMP = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// "Nov 4, 2026, 9:21 PM" from unix seconds.
export function fullStamp(unix: number): string {
  return FULL_STAMP.format(new Date(unix * 1000));
}
