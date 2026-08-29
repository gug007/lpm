import type { ComposerValue } from "../../composerValue";
import { estimateTokens, formatTokenCount } from "../../toolkit";
import { SKILL_DESCRIPTION_MAX } from "../../toolkitSkill";
import { ToolkitComposerField } from "./ToolkitComposerField";

interface SkillDescriptionFieldProps {
  value: ComposerValue;
  text: string;
  onChange: (value: ComposerValue) => void;
  seed: number;
  cwd: string;
  // The CLI that reads the folder the skill sits in, and how the skill is
  // reached there — both only for the wording under the field.
  cli: string;
  manual: boolean;
  invocation: string;
  // The name is charged to the agent alongside the description, so it counts
  // towards the figure even though it is not written here.
  nameLength: number;
  error: string | null;
}

// The description, written the same way in both dialogs that ask for one: the
// sentence under it changes with who runs the skill, and the figure beside it
// is what the description costs the agent every turn — until the text is close
// enough to the cap that its length is the number to watch instead. A manual
// skill costs nothing up front, which its own line already says.
export function SkillDescriptionField({
  value,
  text,
  onChange,
  seed,
  cwd,
  cli,
  manual,
  invocation,
  nameLength,
  error,
}: SkillDescriptionFieldProps) {
  const nearCap = text.length > SKILL_DESCRIPTION_MAX - 200;
  const figure = nearCap ? (
    <span className={text.length > SKILL_DESCRIPTION_MAX ? "text-[var(--accent-red-text)]" : ""}>
      {text.length} / {SKILL_DESCRIPTION_MAX}
    </span>
  ) : manual || !text ? null : (
    `~${formatTokenCount(estimateTokens(nameLength + text.length))} tokens every turn`
  );

  return (
    <ToolkitComposerField
      name="description"
      label={
        <>
          Description <span className="opacity-70">— what it does, and when to use it</span>
        </>
      }
      value={value}
      onChange={onChange}
      seed={seed}
      cwd={cwd}
      placeholder="Deploys the web app to staging. Use when the user says deploy, release, ship or push it live."
      note={
        manual
          ? `Shown beside ${invocation} in the ${cli === "codex" ? "skill" : "slash"} menu.`
          : "The only part your agent reads before deciding to open the skill."
      }
      error={error}
      figure={figure}
    />
  );
}
