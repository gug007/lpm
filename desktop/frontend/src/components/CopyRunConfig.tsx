import { ActionPicker } from "./ActionPicker";
import { ShellCommandInput } from "./ShellCommandInput";
import { SegmentedControl } from "./ui/SegmentedControl";
import { FIELD_CLASS, HELPER_TEXT } from "./ui/fields";
import type { ActionInfo, CopyOverride, CopyRunMode } from "../types";

const OPTIONS: { value: CopyRunMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "none", label: "Nothing" },
  { value: "action", label: "Action" },
  { value: "command", label: "Command" },
];

interface CopyRunConfigProps {
  actions: ActionInfo[];
  override: CopyOverride | null;
  onChangeMode: (mode: CopyRunMode) => void;
  onPatchOverride: (patch: Partial<CopyOverride>) => void;
}

export function CopyRunConfig({
  actions,
  override,
  onChangeMode,
  onPatchOverride,
}: CopyRunConfigProps) {
  const active: CopyRunMode = override ? override.mode : "default";
  const noActions = actions.length === 0;
  const options = OPTIONS.map((o) =>
    o.value === "action" ? { ...o, disabled: noActions } : o,
  );

  return (
    <div className="border-l border-[var(--border)] pl-3">
      <SegmentedControl
        value={active}
        options={options}
        onChange={onChangeMode}
        fullWidth
      />

      {override?.mode === "action" && (
        <ActionPicker
          actions={actions}
          value={override.actionName}
          onChange={(name) => onPatchOverride({ actionName: name })}
        />
      )}

      {override?.mode === "command" && (
        <div className="mt-2">
          <ShellCommandInput
            value={override.command}
            onChange={(value) => onPatchOverride({ command: value })}
            autoFocus
          />
        </div>
      )}

      {!override ? (
        <p className={`mt-2 ${HELPER_TEXT}`}>Inherits the shared default above.</p>
      ) : override.mode === "none" ? (
        <p className={`mt-2 ${HELPER_TEXT}`}>Nothing runs on this copy.</p>
      ) : (
        <textarea
          value={override.prompt}
          onChange={(e) => onPatchOverride({ prompt: e.target.value })}
          spellCheck={false}
          placeholder="Prompt for an AI agent (optional)…"
          className={`mt-2 ${FIELD_CLASS} block max-h-[160px] min-h-[52px] resize-none px-3 py-2 leading-snug`}
        />
      )}
    </div>
  );
}
