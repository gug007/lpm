import { autoPullExceptions, normalizeAutoPullMode, type AutoPullMode } from "../../autoPull";
import { autoPullSoon } from "../../autoPullRun";
import { useAppStore } from "../../store/app";
import { rowProps } from "../../settings-registry";
import { isOnMachine } from "../../settingsMachine";
import { displayNameForProjectName } from "../ProjectNameDisplay";
import { SettingsRow } from "../SettingsRow";
import { useSettingsTarget } from "./settingsTarget";
import { SegmentedControl } from "../ui/SegmentedControl";

const OPTIONS: { value: AutoPullMode; label: string; tooltip: string }[] = [
  { value: "off", label: "Off", tooltip: "Never pull on its own" },
  { value: "chosen", label: "Chosen", tooltip: "Only projects set to On in their Git menu" },
  { value: "all", label: "All", tooltip: "Every project unless it’s set to Off in its Git menu" },
];

function exceptionsLine(mode: AutoPullMode, on: string[], off: string[]): string {
  if (mode === "chosen") {
    return on.length > 0 ? `On for ${on.join(", ")}` : "No projects chosen yet: right-click one › Git › Auto pull › On";
  }
  return off.length > 0 ? `Off for ${off.join(", ")}` : "";
}

// Settings › Git: which projects fast-forward on their own after the check
// for new commits, and which of the machine's projects or copies differ from that.
export function AutoPullSettingsRow() {
  const { machine, settings, update } = useSettingsTarget();
  const checkOrigin = settings.checkOrigin ?? true;
  const mode = normalizeAutoPullMode(settings.autoPull);
  const projects = useAppStore((s) => s.projects);

  const own = projects.filter((p) => isOnMachine(p.name, machine) && !p.isRemote && !p.configError);
  const names = (list: string[]) => list.map((name) => displayNameForProjectName(name, projects));
  const exceptions = autoPullExceptions(own, mode);
  const line = checkOrigin && mode !== "off" ? exceptionsLine(mode, names(exceptions.on), names(exceptions.off)) : "";

  // A connected machine runs its own pulls, on its own schedule.
  const choose = (next: AutoPullMode) => {
    void update({ autoPull: next });
    if (next !== "off" && machine.kind === "local") autoPullSoon();
  };

  return (
    <SettingsRow
      {...rowProps("general.autoPull", checkOrigin ? undefined : { description: "Turn on Check for new commits to use this" })}
      below={line ? <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]" title={line}>{line}</p> : undefined}
      details={
        <>
          <p>Runs after each check for new commits. A project pulls only when its branch tracks origin, has no uncommitted changes and no commits of yours to push, so the pull is always a fast-forward.</p>
          <p>A project waits while an agent is working in it. Undo a pull from its notification or the project’s Git menu.</p>
          <p>Set a project or one of its duplicates on its own from the project’s Git menu › Auto pull.</p>
        </>
      }
    >
      <SegmentedControl
        value={mode}
        onChange={choose}
        ariaLabel="Auto pull"
        options={OPTIONS.map((o) => ({ ...o, disabled: !checkOrigin }))}
      />
    </SettingsRow>
  );
}
