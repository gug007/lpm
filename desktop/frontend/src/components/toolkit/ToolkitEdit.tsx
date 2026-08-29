import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ReadAgentCapability, UpdateAgentSkill } from "../../../bridge/commands";
import type { AgentCapability, CapabilityDoc } from "../../toolkit";
import { manualOnly, shortPath } from "../../toolkit";
import {
  EMPTY_COMPOSER,
  composerValueToText,
  textToPrompt,
  type ComposerValue,
} from "../../composerValue";
import {
  isSharedSkillsDir,
  joinSkillBody,
  skillDescription,
  skillDescriptionError,
  skillInstructionsError,
  splitSkillBody,
} from "../../toolkitSkill";
import { LABEL } from "./OptionCard";
import { SkillDescriptionField } from "./SkillDescriptionField";
import { ToolkitComposerField } from "./ToolkitComposerField";
import { ToolkitRunMode } from "./ToolkitRunMode";
import { ToolkitSkillModal } from "./ToolkitSkillModal";

interface ToolkitEditProps {
  cwd: string;
  cap: AgentCapability;
  // The tab this was opened from is showing; see the modal's own note.
  open: boolean;
  onBack: () => void;
  onSaved: () => void;
}

// Changing a skill, in the form that wrote it. The name and the folder are what
// the agent resolves the skill by, so they are shown rather than offered: a
// skill's name is its folder, and moving it is not an edit to its text.
export function ToolkitEdit({ cwd, cap, open, onBack, onSaved }: ToolkitEditProps) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [description, setDescription] = useState<ComposerValue>(EMPTY_COMPOSER);
  const [instructions, setInstructions] = useState<ComposerValue>(EMPTY_COMPOSER);
  const [manual, setManual] = useState(() => manualOnly(cap));
  // Bumped whenever the file seeds the prose fields; see the field's own note.
  const [seed, setSeed] = useState(0);
  const [saving, setSaving] = useState(false);

  // What the file says now, against what the form is offering to write. The
  // heading lpm writes from the name rides outside the field and goes back on
  // top of whatever is saved.
  const saved = useMemo(() => splitSkillBody(baseline ?? ""), [baseline]);
  const savedDescription = useMemo(() => skillDescription(baseline ?? ""), [baseline]);

  // Keyed on the two values it reads rather than the capability itself: a
  // re-scan behind the dialog hands back an equal object, and reloading on that
  // would reseed the fields under the user's cursor.
  const savedManual = manualOnly(cap);
  const path = cap.path;
  const load = useCallback(async () => {
    try {
      const doc = (await ReadAgentCapability(path)) as CapabilityDoc;
      const body = splitSkillBody(doc.content);
      setBaseline(doc.content);
      setDescription(textToPrompt(skillDescription(doc.content)));
      setInstructions(textToPrompt(body.instructions));
      setManual(savedManual);
      setSeed((n) => n + 1);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }, [path, savedManual]);

  useEffect(() => {
    void load();
  }, [load]);

  const descriptionText = composerValueToText(description);
  const instructionsText = composerValueToText(instructions);
  const descriptionError = skillDescriptionError(descriptionText);
  // A body nobody touched is never rewritten: it goes back to disk byte for
  // byte, so a description change cannot reflow prose the user did not open
  // this for. Which also means an empty one only has to be filled in to save
  // once it is what the form is offering to change.
  const rewritten = baseline !== null && instructionsText !== saved.instructions;
  const instructionsError = rewritten ? skillInstructionsError(instructionsText) : null;
  const edited =
    baseline !== null &&
    (descriptionText !== savedDescription || manual !== savedManual || rewritten);

  const manualAllowed = cap.cli === "claude" || cap.cli === "codex";
  const invocation = `${cap.cli === "codex" ? "$" : "/"}${cap.name}`;
  const skillRoot = cap.path.replace(/\/[^/]+\/SKILL\.md$/, "");

  const save = async () => {
    if (saving || !edited || descriptionError || instructionsError || baseline === null) return;
    setSaving(true);
    try {
      await UpdateAgentSkill(
        cwd,
        cap.path,
        baseline,
        descriptionText,
        manual,
        rewritten ? joinSkillBody(saved.heading, instructionsText) : null,
      );
      toast.success("Saved");
      onSaved();
      onBack();
    } catch (err) {
      if (String(err).includes("modified")) {
        toast.error("Changed on disk since you opened it — reloading.");
        await load();
      } else {
        toast.error(String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const hint = error
    ? error
    : baseline === null
      ? "Opening…"
      : (descriptionError ?? instructionsError ?? (edited ? "↩ saves it" : ""));

  return (
    <ToolkitSkillModal
      open={open}
      title="Edit skill"
      subtitle="What this skill says it does, and what your agent reads once it opens it."
      hint={hint}
      submitLabel="Save changes"
      busyLabel="Saving…"
      busy={saving}
      blocked={!edited || Boolean(descriptionError) || Boolean(instructionsError)}
      dirty={edited && !saving}
      discardTitle="Discard your changes?"
      discardBody="The skill on disk stays as it is."
      onClose={onBack}
      onSubmit={() => void save()}
    >
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Name</span>
        <p className="truncate font-mono text-[12.5px] text-[var(--text-primary)]">{cap.name}</p>
        <p className="truncate font-mono text-[11.5px] text-[var(--text-muted)]">
          {shortPath(cap.path)}
        </p>
      </div>

      <ToolkitRunMode
        cli={cap.cli}
        shared={cap.cli === "codex" && isSharedSkillsDir(skillRoot)}
        manual={manual}
        manualAllowed={manualAllowed}
        onManual={setManual}
        invocation={invocation}
      />

      {/* Seeded from the file, so the fields wait for it: filling an empty box
          and refilling it a frame later under the cursor is worse than the
          beat it takes to read the file. */}
      {baseline !== null && (
        <>
          <SkillDescriptionField
            value={description}
            text={descriptionText}
            onChange={setDescription}
            seed={seed}
            cwd={cwd}
            cli={cap.cli}
            manual={manual}
            invocation={invocation}
            nameLength={cap.name.length}
            error={descriptionText ? descriptionError : null}
          />

          <ToolkitComposerField
            name="instructions"
            label="Instructions"
            value={instructions}
            onChange={setInstructions}
            seed={seed}
            cwd={cwd}
            placeholder={
              "1. Build with npm run build, then run ./scripts/deploy.sh staging\n2. Check the staging site loads before saying it shipped"
            }
            note="Read only once the skill runs, so its length costs nothing up front."
            error={instructionsError}
          />
        </>
      )}
    </ToolkitSkillModal>
  );
}
