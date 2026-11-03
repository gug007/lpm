import type { AgentFilesAccess, AgentFilesScope } from "../../peer/usePeerState";
import { SettingsSelect } from "../SettingsSelect";
import { useSaving } from "./useSaving";

// What a computer's agents may copy, and in which folders, saved through `save`.
export function AgentFilesSelects({
  access,
  scope,
  readLabel,
  errorTitle,
  save,
}: {
  access: AgentFilesAccess;
  scope: AgentFilesScope;
  readLabel: string;
  errorTitle: string;
  save: (access: AgentFilesAccess, scope: AgentFilesScope) => Promise<unknown>;
}) {
  const { busy, run } = useSaving(errorTitle);
  const change = (next: AgentFilesAccess, nextScope: AgentFilesScope) => run(() => save(next, nextScope));

  return (
    <>
      {access !== "off" && (
        <SettingsSelect
          aria-label="Folders agents may copy in"
          value={scope}
          disabled={busy}
          onChange={(e) => void change(access, e.target.value as AgentFilesScope)}
        >
          <option value="projects">Projects only</option>
          <option value="home">Home folder too</option>
        </SettingsSelect>
      )}
      <SettingsSelect
        aria-label="What agents may copy"
        value={access}
        disabled={busy}
        onChange={(e) => void change(e.target.value as AgentFilesAccess, scope)}
      >
        <option value="off">Off</option>
        <option value="read">{readLabel}</option>
        <option value="write">Copy both ways</option>
      </SettingsSelect>
    </>
  );
}
