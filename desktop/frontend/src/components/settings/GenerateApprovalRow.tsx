import { useEffect, useState } from "react";
import type { GenerateApprovalMode } from "../../generate";
import { rowProps } from "../../settings-registry";
import { toast } from "../../notifications/toast";
import { SettingsRow } from "../SettingsRow";
import { SegmentButton } from "./SegmentButton";
import { useSettingsTarget } from "./settingsTarget";

const MODES: { mode: GenerateApprovalMode; label: string; hint: string }[] = [
  {
    mode: "each",
    label: "Ask each time",
    hint: "lpm shows the prompt, model and cost before every image or clip.",
  },
  {
    mode: "project",
    label: "Ask once per project",
    hint: "The first request in a project asks. After you allow it, that project runs straight away.",
  },
  {
    mode: "always",
    label: "Always allow",
    hint: "Agents make files without asking, up to the daily limit.",
  },
];

// How lpm answers an agent's `lpm generate`, and the projects already allowed.
export function GenerateApprovalRow() {
  const { machine, settings, update, commands } = useSettingsTarget();
  const mode = settings.generateApproval ?? "project";
  const current = MODES.find((m) => m.mode === mode) ?? MODES[1];
  const [allowed, setAllowed] = useState<string[]>([]);
  const unattended = machine.kind === "peer" && !machine.attended;

  useEffect(() => {
    commands.generate
      .allowedProjects()
      .then(setAllowed)
      .catch(() => setAllowed([]));
  }, [commands, mode]);

  const forget = () =>
    commands.generate
      .forgetProjects()
      .then(() => setAllowed([]))
      .catch((err) => toast.error("Couldn't forget the projects", { description: String(err) }));

  const hint = unattended && mode !== "always"
    ? `Nobody sits at ${machine.name} to answer, so its agents can generate only with Always allow.`
    : current.hint;

  return (
    <SettingsRow
      {...rowProps("generate.approval")}
      description={hint}
      stacked
      below={
        mode === "project" && allowed.length > 0 ? (
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Allowed: {allowed.join(", ")}.{" "}
            <button
              type="button"
              onClick={() => void forget()}
              className="text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              Ask again everywhere
            </button>
          </p>
        ) : undefined
      }
    >
      <div className="flex w-fit flex-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
        {MODES.map((m) => (
          <SegmentButton
            key={m.mode}
            label={m.label}
            active={m.mode === mode}
            onClick={() => void update({ generateApproval: m.mode })}
          />
        ))}
      </div>
    </SettingsRow>
  );
}
