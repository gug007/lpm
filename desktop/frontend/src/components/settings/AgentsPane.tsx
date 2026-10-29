import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { isMac } from "../../platform";
import { rowProps, TAB_TITLES } from "../../settings-registry";
import type { View } from "../../store/app";
import { ComposerActionsModal } from "../ComposerActionsModal";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { StatusLineRowPreview } from "../StatusLineRowPreview";
import { BTN_SECONDARY } from "../ui/buttons";
import { Toggle } from "../ui/Toggle";
import { AgentArchiveSettingsSection } from "./AgentArchiveSettingsSection";
import { AgentToolsRow } from "./AgentToolsRow";
import { AIModelSettingsRow } from "./AIModelSettingsRow";
import { ClaudeHooksRow } from "./ClaudeHooksRow";
import { SettingsLink } from "./SettingsLink";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

const NOTE = "mt-1 text-[11px] text-[var(--text-muted)]";

// Settings › Agents: how agents start, the model lpm itself writes with, how
// you write to them, how they sit in the sidebar, and what lpm adds to each
// agent CLI.
export function AgentsPane({ onNavigate }: { onNavigate: (view: View) => void }) {
  const shows = useRowReach();
  const { settings, update, commands } = useSettingsTarget();
  const [editingActions, setEditingActions] = useState(false);
  const dictation = isMac && shows("ai.voiceToText");
  const messageInput =
    shows("terminal.input") || shows("terminal.autoCloseComposer") || shows("agents.quickActions") || dictation;

  return (
    <>
      {shows("terminal.pickAgentOnNewTab") && (
        <SettingsSection title="Starting agents">
          <SettingsRow {...rowProps("terminal.pickAgentOnNewTab")}>
            <Toggle
              aria-label="Pick an agent for new tabs"
              enabled={settings.pickAgentOnNewTab ?? false}
              onChange={(v) => void update({ pickAgentOnNewTab: v })}
            />
          </SettingsRow>
        </SettingsSection>
      )}

      {shows("git.aiModel") && (
        <SettingsSection title="lpm's AI">
          <AIModelSettingsRow />
        </SettingsSection>
      )}

      {messageInput && (
        <SettingsSection title="Message input">
          {shows("terminal.input") && (
            <SettingsRow {...rowProps("terminal.input")}>
              <Toggle
                aria-label="Show the message input"
                enabled={settings.composerOpen ?? true}
                onChange={(v) => void update({ composerOpen: v })}
              />
            </SettingsRow>
          )}
          {shows("terminal.autoCloseComposer") && (
            <SettingsRow {...rowProps("terminal.autoCloseComposer")}>
              <Toggle
                aria-label="Close a draft once it's sent"
                enabled={settings.autoCloseComposerOnSend ?? true}
                onChange={(v) => void update({ autoCloseComposerOnSend: v })}
              />
            </SettingsRow>
          )}
          {shows("agents.quickActions") && (
            <SettingsRow {...rowProps("agents.quickActions")}>
              <button onClick={() => setEditingActions(true)} className={BTN_SECONDARY}>
                Edit…
              </button>
            </SettingsRow>
          )}
          {dictation && (
            <SettingsRow {...rowProps("ai.voiceToText")}>
              <a
                href="https://voicetotext.cc"
                onClick={(e) => {
                  e.preventDefault();
                  BrowserOpenURL("https://voicetotext.cc");
                }}
                className="flex items-center gap-0.5 text-xs font-medium text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
              >
                voicetotext.cc
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </SettingsRow>
          )}
        </SettingsSection>
      )}

      <AgentArchiveSettingsSection />

      {(shows("ai.statusLine") || shows("ai.claudeHooks")) && (
        <SettingsSection title="Claude Code">
          {shows("ai.statusLine") && (
            <SettingsRow
              {...rowProps("ai.statusLine")}
              below={
                <>
                  <StatusLineRowPreview agent="claude" statusLine={commands.statusLine} />
                  {shows("accounts.readClaudeUsage") && (
                    <p className={NOTE}>
                      <SettingsLink tab="accounts" row="accounts.readClaudeUsage">
                        Read Claude usage
                      </SettingsLink>{" "}
                      adds lpm to this line too.
                    </p>
                  )}
                </>
              }
            >
              <button onClick={() => onNavigate("claude-statusline")} className={BTN_SECONDARY}>
                Customize…
              </button>
            </SettingsRow>
          )}
          {shows("ai.claudeHooks") && <ClaudeHooksRow />}
        </SettingsSection>
      )}

      {shows("ai.codexStatusLine") && (
        <SettingsSection title="Codex">
          <SettingsRow
            {...rowProps("ai.codexStatusLine")}
            below={<StatusLineRowPreview agent="codex" statusLine={commands.statusLine} />}
          >
            <button onClick={() => onNavigate("codex-statusline")} className={BTN_SECONDARY}>
              Customize…
            </button>
          </SettingsRow>
        </SettingsSection>
      )}

      {shows("general.agentTools") && (
        <SettingsSection title="lpm for your agents">
          <AgentToolsRow />
        </SettingsSection>
      )}

      {shows("ai.accounts") && (
        <p className="mt-6 px-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Claude accounts and plan limits are in{" "}
          <SettingsLink tab="accounts" row="ai.accounts">
            {TAB_TITLES.accounts}
          </SettingsLink>
          .
        </p>
      )}

      {shows("agents.quickActions") && (
        <ComposerActionsModal open={editingActions} onClose={() => setEditingActions(false)} title="Quick actions" />
      )}
    </>
  );
}
