import { shortPath } from "../../toolkit";
import { isSharedSkillsDir, type SkillDestination } from "../../toolkitSkill";
import { Plate, agentMark, type MarkKind } from "./OptionCard";
import { OptionSelect } from "./OptionSelect";
import { ToolkitRunMode } from "./ToolkitRunMode";

function markKind(dest: SkillDestination): MarkKind {
  return agentMark(dest.cli, isSharedSkillsDir(dest.path));
}

interface ToolkitSkillOptionsProps {
  destinations: SkillDestination[];
  destPath: string;
  onDest: (path: string) => void;
  manual: boolean;
  manualAllowed: boolean;
  onManual: (manual: boolean) => void;
  invocation: string;
}

// The two choices a new skill needs after its name. Both collapse to a line
// with their answer spelled out underneath: the folders differ only by the path
// they write to, so the path has to stay readable without opening anything.
export function ToolkitSkillOptions({
  destinations,
  destPath,
  onDest,
  manual,
  manualAllowed,
  onManual,
  invocation,
}: ToolkitSkillOptionsProps) {
  const dest = destinations.find((d) => d.path === destPath) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <OptionSelect
        label="Folder"
        tone="dest"
        value={destPath}
        onChange={onDest}
        options={destinations.map((option) => ({
          id: option.path,
          mark: <Plate kind={markKind(option)} />,
          title: option.label,
          note: option.exists
            ? shortPath(option.path)
            : `${shortPath(option.path)} — will be created`,
          mono: true,
        }))}
      />

      <ToolkitRunMode
        cli={dest?.cli ?? ""}
        shared={dest?.cli === "codex" && isSharedSkillsDir(dest.path)}
        manual={manual}
        manualAllowed={manualAllowed}
        onManual={onManual}
        invocation={invocation}
      />
    </div>
  );
}
