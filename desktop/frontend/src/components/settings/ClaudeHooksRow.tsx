import { useState } from "react";
import { toast } from "../../notifications/toast";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { ClaudeHooksCheck } from "./machineCommands";
import { useSettingsTarget } from "./settingsTarget";
import { Spinner } from "./Spinner";

type HooksStatus =
  | "idle"
  | "checking"
  | "installed"
  | "missing"
  | "no-settings"
  | "disabled"
  | "no-helper";

const HOOKS_STATUS: Record<Exclude<HooksStatus, "idle">, { text: string; tone: string }> = {
  checking: { text: "Checking…", tone: "text-[var(--text-muted)]" },
  installed: { text: "Hooks installed correctly", tone: "text-[var(--accent-green-text)]" },
  missing: { text: "Hooks not configured", tone: "text-[var(--accent-amber-text)]" },
  "no-settings": { text: "Claude Code settings not found", tone: "text-[var(--accent-amber-text)]" },
  disabled: {
    text: "Claude Code's settings turn its hooks off, so its progress can't show",
    tone: "text-[var(--accent-amber-text)]",
  },
  "no-helper": {
    text: "Part of lpm is missing, so Claude Code's progress can't show. Reinstall lpm",
    tone: "text-[var(--accent-amber-text)]",
  },
};

function hooksStatus(check: ClaudeHooksCheck): HooksStatus {
  if (!check.settingsExists) return "no-settings";
  if (check.hooksDisabled) return "disabled";
  if (check.helperMissing) return "no-helper";
  return check.hooksInstalled ? "installed" : "missing";
}

// The hooks that let Claude Code report its progress, checked and reinstalled
// on the machine being configured.
export function ClaudeHooksRow() {
  const { commands } = useSettingsTarget();
  const [status, setStatus] = useState<HooksStatus>("idle");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  const check = async () => {
    setStatus("checking");
    try {
      const next = hooksStatus(await commands.checkClaudeHooks());
      setStatus(next);
      if (next === "missing") setShowResetDialog(true);
    } catch {
      setStatus("idle");
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await commands.resetClaudeHooks();
      setStatus("installed");
      setShowResetDialog(false);
      toast.success("Claude Code hooks reinstalled");
    } catch (err) {
      toast.error(`Failed to reset hooks: ${err}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <SettingsRow
        {...rowProps("ai.claudeHooks")}
        below={
          status !== "idle" && (
            <p role="status" className={`mt-1 text-[11px] ${HOOKS_STATUS[status].tone}`}>
              {HOOKS_STATUS[status].text}
            </p>
          )
        }
      >
        <div className="flex items-center gap-2">
          <button onClick={check} disabled={status === "checking" || resetting} className={BTN_SECONDARY}>
            {status === "checking" ? <Spinner /> : "Check"}
          </button>
          <button onClick={reset} disabled={resetting || status === "checking"} className={BTN_SECONDARY}>
            {resetting ? <Spinner /> : "Reset"}
          </button>
        </div>
      </SettingsRow>
      <ConfirmDialog
        open={showResetDialog}
        title="Reset Claude Code hooks"
        body="Claude Code hooks are not configured correctly. Would you like to reinstall them?"
        confirmLabel="Reset"
        disabled={resetting}
        onCancel={() => setShowResetDialog(false)}
        onConfirm={reset}
      />
    </>
  );
}
