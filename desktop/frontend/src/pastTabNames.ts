import { agentSessionRefOf } from "./agentSession";
import { statusKeyPrefix } from "./agentStatus";
import { collectPersistedTabs, getProjectTerminals } from "./terminals";
import type { StatusEntry } from "./types";

// What a project's saved tabs were called, by the status key of the agent each
// ran. A status kept from before lpm last started has lost its tab, which died
// with the app, but a Claude or Codex status is keyed by its conversation, and
// the saved tab still names that conversation.
export function pastTabNames(projectName: string): Record<string, string> {
  const names: Record<string, string> = {};
  for (const tab of collectPersistedTabs(getProjectTerminals(projectName).panes)) {
    const ref = agentSessionRefOf(tab.resumeCmd);
    const prefix = ref && statusKeyPrefix(ref.provider);
    if (ref && prefix) names[`${prefix}${ref.sessionId}`] = tab.sessionTitle || tab.label;
  }
  return names;
}

/** `pastTabNames`, only when one of the statuses has lost its tab. */
export function pastTabNamesFor(
  projectName: string,
  ...lists: (StatusEntry[] | undefined)[]
): Record<string, string> | undefined {
  return lists.some((list) => list?.some((e) => !e.paneID)) ? pastTabNames(projectName) : undefined;
}
