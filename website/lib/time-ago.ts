import { useClientNow } from "@/app/claude-code-codex-token-usage/_components/use-client-now";

const MINUTE_MS = 60_000;

function timeAgo(ms: number): string {
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// Pages are rendered ahead of time, so the server writes `fallback` and the
// visitor's clock turns `iso` into how long ago that was.
export function useTimeAgo(iso: string, fallback: string | null): string | null {
  const now = useClientNow();
  return now === null ? fallback : timeAgo(Math.max(0, now - Date.parse(iso)));
}
