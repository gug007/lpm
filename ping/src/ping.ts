// What a ping from lpm says (dailyping.rs builds it). Anything else is refused,
// so a stray request can't add rows of its own making.

export interface Ping {
  version: string;
  os: string;
  arch: string;
  kind: string;
  weekly: 0 | 1;
  monthly: 0 | 1;
  installs: 0 | 1;
  cohort: string;
}

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.]{1,24})?$/;
const ARCH = /^[a-z0-9_]{1,16}$/;
const COHORT = /^20\d\d-(?:0[1-9]|1[0-2])$/;
const OSES = new Set(["macos", "linux", "windows"]);
const KINDS = new Set(["desktop", "host"]);
// lpm's first release; an older lpm folder belonged to something else.
const FIRST_COHORT = "2026-03";

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function parsePing(params: URLSearchParams, today: string): Ping | null {
  const get = (key: string) => params.get(key) ?? "";
  const flag = (key: string): 0 | 1 | null => (get(key) === "1" ? 1 : get(key) === "0" ? 0 : null);
  const [weekly, monthly, installs] = [flag("w"), flag("m"), flag("new")];
  const ping = {
    version: get("v"),
    os: get("os"),
    arch: get("arch"),
    kind: get("kind"),
    cohort: get("cohort"),
  };
  if (
    !VERSION.test(ping.version) ||
    !OSES.has(ping.os) ||
    !ARCH.test(ping.arch) ||
    !KINDS.has(ping.kind) ||
    !COHORT.test(ping.cohort) ||
    weekly === null ||
    monthly === null ||
    installs === null
  ) {
    return null;
  }
  const month = today.slice(0, 7);
  const cohort = ping.cohort < FIRST_COHORT ? FIRST_COHORT : ping.cohort > month ? month : ping.cohort;
  return { ...ping, cohort, weekly, monthly, installs };
}
