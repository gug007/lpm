import { shortPath } from "../../toolkit";
import { isSharedSkillsDir, type SkillDestination } from "../../toolkitSkill";
import {
  GRID,
  LABEL,
  OptionCard,
  Plate,
  agentMark,
  onRadioKey,
  type MarkKind,
} from "./OptionCard";
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

// The two choices a new skill needs after its name. Both are cards rather than
// a line of tokens: the folders differ only by the path they write to, so the
// path has to be readable while the choice is being made.
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
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Folder</span>
        <div role="radiogroup" aria-label="Folder" className={GRID} onKeyDown={onRadioKey}>
          {/* A re-scan can orphan the chosen path for a beat; the first card
              holds the tab stop until the fallback re-picks, so the group never
              drops out of the tab order. */}
          {destinations.map((option, index) => (
            <OptionCard
              key={option.path}
              on={option.path === destPath}
              tabIndex={option.path === destPath || (!dest && index === 0) ? 0 : -1}
              tone="dest"
              mark={<Plate kind={markKind(option)} />}
              title={option.label}
              note={
                option.exists
                  ? shortPath(option.path)
                  : `${shortPath(option.path)} — will be created`
              }
              mono
              onPick={() => onDest(option.path)}
            />
          ))}
        </div>
      </div>

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
