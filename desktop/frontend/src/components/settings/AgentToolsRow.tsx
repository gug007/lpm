import { rowProps } from "../../settings-registry";
import { AgentToolsManualSetup } from "../AgentToolsManualSetup";
import { SettingsRow } from "../SettingsRow";
import { SkillInstallControl } from "../SkillInstallControl";

export function AgentToolsRow() {
  return (
    <SettingsRow
      {...rowProps("general.agentTools")}
      details={
        <>
          <p>Skills teach AI coding agents how lpm works. Claude Code, Codex, Gemini CLI, and OpenCode pick them up automatically.</p>
          <p>Agents learn to create and edit project configurations and to start, stop, and duplicate projects on your behalf.</p>
          <p>The lpm command line tool is also installed, so agents — and you — can control projects from any terminal.</p>
          <AgentToolsManualSetup />
        </>
      }
    >
      <SkillInstallControl />
    </SettingsRow>
  );
}
