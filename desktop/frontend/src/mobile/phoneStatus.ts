/** A paired phone as `remote_state` lists it. */
export interface PhoneDevice {
  id: string;
  /** The name shown here: the one set on this machine, else the phone's own. */
  name: string;
  /** What the phone calls itself; iOS reports just "iPhone". */
  phoneName: string;
  createdAt: number;
  connected: boolean;
  /** How the open connection came in, while connected. */
  route: string | null;
  /** Last connect or disconnect, in ms; 0 when not seen since pairing. */
  lastSeen: number;
  lastRoute: string | null;
}

const ROUTE_PHRASE: Record<string, string> = {
  network: "on your network",
  tailscale: "over Tailscale",
  internet: "over the internet",
};

export function routePhrase(route: string | null, thisMachine: string): string {
  if (route === "local") return `on ${thisMachine}`;
  return route ? (ROUTE_PHRASE[route] ?? "") : "";
}

const DAY = 86_400_000;

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago", or a date. */
export function ago(ms: number, now: number): string {
  const d = Math.max(0, now - ms);
  if (d < 60_000) return "just now";
  if (d < 3_600_000) {
    const m = Math.floor(d / 60_000);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (d < DAY) {
    const h = Math.floor(d / 3_600_000);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (d < 2 * DAY) return "yesterday";
  if (d < 14 * DAY) return `${Math.floor(d / DAY)} days ago`;
  if (d < 60 * DAY) return `${Math.floor(d / (7 * DAY))} weeks ago`;
  return `on ${pairedDate(ms, now)}`;
}

/** "26 Aug", with the year when it isn't this year. */
export function pairedDate(ms: number, now: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** A phone row's second line: whether it's here, how it came in, and when
 *  it was paired. `lead` is the part shown in the live color. */
export function phoneSubtitle(
  d: PhoneDevice,
  now: number,
  thisMachine: string,
): { lead: string; rest: string; live: boolean } {
  const paired = `paired ${pairedDate(d.createdAt, now)}`;
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  if (d.connected) {
    return { lead: "Connected now", rest: join(routePhrase(d.route, thisMachine), paired), live: true };
  }
  if (d.lastSeen > 0) {
    return {
      lead: "",
      rest: join(`Last connected ${ago(d.lastSeen, now)}`, routePhrase(d.lastRoute, thisMachine), paired),
      live: false,
    };
  }
  return { lead: "", rest: join("Not seen since pairing", paired), live: false };
}

/** Connected phones first, then the most recently seen, then the newest. */
export function sortPhones(list: PhoneDevice[]): PhoneDevice[] {
  return [...list].sort(
    (a, b) =>
      Number(b.connected) - Number(a.connected) ||
      b.lastSeen - a.lastSeen ||
      b.createdAt - a.createdAt,
  );
}

/** Whether any paired device has reached this machine over Tailscale. */
export function anyOverTailscale(list: PhoneDevice[]): boolean {
  return list.some((d) => d.route === "tailscale" || d.lastRoute === "tailscale");
}
