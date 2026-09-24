import DialogCollapsible from "./dialog-collapsible";
import DialogPromptBox from "./dialog-prompt-box";
import DialogSegmented from "./dialog-segmented";
import DialogTargetField from "./dialog-target-field";
import {
  RUN_OPTIONS,
  SAMPLE_PROMPT,
  copyRef,
  runSummary,
  type RunMode,
} from "./dialog-data";
import { HELPER_TEXT } from "./dialog-styles";

export default function DialogRunCard({
  count,
  mode,
  onModeChange,
  open,
  onToggle,
}: {
  count: number;
  mode: RunMode;
  onModeChange: (next: RunMode) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const ref = copyRef(count);
  const title = count === 1 ? "Run on the copy" : "Run on each copy";
  return (
    <DialogCollapsible
      title={title}
      summary={runSummary(mode)}
      open={open}
      onToggle={onToggle}
    >
      <div className="px-4 py-3">
        <DialogSegmented
          label={title}
          value={mode}
          options={RUN_OPTIONS}
          onChange={onModeChange}
        />
        {mode !== "none" && (
          <>
            <DialogTargetField mode={mode} />
            <p className={`mt-1.5 ${HELPER_TEXT}`}>
              {mode === "command"
                ? `Runs in a terminal on ${ref} as soon as it's created.`
                : `Starts on ${ref} in the background as soon as it's created.`}
            </p>
            <div className="mt-3">
              <DialogPromptBox
                text={SAMPLE_PROMPT}
                placeholder="Type a task for an AI agent, and paste or attach images…"
              />
              <p className={`mt-1.5 ${HELPER_TEXT}`}>
                Sent to {ref}&apos;s terminal once it&apos;s ready. Leave blank
                to send nothing.
              </p>
            </div>
          </>
        )}
      </div>
    </DialogCollapsible>
  );
}
