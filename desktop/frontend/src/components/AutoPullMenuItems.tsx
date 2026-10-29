import { followLabel, type AutoPullMode } from "../autoPull";
import { setProjectAutoPull } from "../autoPullRun";
import { useAppStore } from "../store/app";
import { CheckIcon } from "./icons";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { ContextMenuItem } from "./ui/ContextMenuItem";

// The Git menu's Auto pull choices, listed in place: follow (the Settings
// default, or the parent for a copy), On or Off for this project alone. A
// submenu would sit inside the Git panel's scroll area, which clips it. `mode`
// is the Settings default of the machine the project is on.
export function AutoPullMenuItems({
  projectName,
  mode,
  onClose,
}: {
  projectName: string;
  mode: AutoPullMode;
  onClose: () => void;
}) {
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.name === projectName);
  if (!project) return null;

  const parentLabel = project.parentName ? displayNameForProjectName(project.parentName, projects) : undefined;
  const off = mode === "off";
  const choices: { value: boolean | undefined; label: string }[] = [
    { value: undefined, label: followLabel(project, projects, mode, parentLabel) },
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];

  return (
    <>
      <div className="px-3 pb-0.5 pt-1 text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Auto pull
      </div>
      {choices.map((choice) => (
        <ContextMenuItem
          key={choice.label}
          label={choice.label}
          icon={<span className="flex w-3.5 justify-center">{project.autoPull === choice.value && <CheckIcon />}</span>}
          disabled={off}
          title={off ? "Auto pull is off for every project in Settings › Git" : undefined}
          onClick={() => {
            onClose();
            if (project.autoPull !== choice.value) void setProjectAutoPull(project.name, choice.value ?? null);
          }}
        />
      ))}
    </>
  );
}
