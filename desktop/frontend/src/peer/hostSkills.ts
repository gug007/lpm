// What a Linux host's agent skills look like from here, and what to offer about
// it. The host installs and refreshes them itself on every start, so this is a
// repair path rather than the normal one: it exists for the start that failed,
// the files someone deleted, and the machine that would otherwise need a full
// reinstall — which restarts lpm there and ends every agent on it — to fix a
// handful of markdown files.

export type HostSkillState = "installed" | "outdated" | "not-installed" | "unknown";

// The host answers with its own status, computed against the copies embedded in
// the binary it is running. Anything we don't recognise — an older host, a
// reply that never arrived — is "unknown": still offerable, never advertised.
export function parseHostSkillState(value: unknown): HostSkillState {
  const status = (value as { status?: unknown } | null)?.status;
  return status === "installed" || status === "outdated" || status === "not-installed"
    ? status
    : "unknown";
}

export function hostSkillLabel(state: HostSkillState): string {
  if (state === "not-installed") return "Install skills there";
  if (state === "outdated") return "Update skills there";
  return "Reinstall skills there";
}

// Only says something when there is something to say. A host whose skills are
// current is the normal case and gets no note at all.
export function hostSkillNote(state: HostSkillState): string {
  if (state === "not-installed") return " · skills not installed";
  if (state === "outdated") return " · skills out of date";
  return "";
}

// A host old enough to predate this refusing the command is the one failure
// worth rewriting: the message names a transport nobody chose, and the fix is
// the update the row is already offering.
export function hostSkillError(raw: string): string {
  return raw.includes("not permitted")
    ? "That host is running a version of lpm too old to install its skills. Update lpm there first."
    : raw;
}
