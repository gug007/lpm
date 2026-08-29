import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CreateAgentSkill } from "../../../bridge/commands";
import type { AgentCapability, CapabilityRoot } from "../../toolkit";
import { shortPath } from "../../toolkit";
import {
  defaultDestination,
  skillClash,
  skillDescriptionError,
  skillInstructionsError,
  skillDestinations,
  skillFilePath,
  skillName,
  skillNameDraft,
  skillNameError,
  skillTemplate,
} from "../../toolkitSkill";
import {
  EMPTY_COMPOSER,
  composerValueToText,
  textToPrompt,
  type ComposerValue,
} from "../../composerValue";
import { LABEL } from "./OptionCard";
import { SkillDescriptionField } from "./SkillDescriptionField";
import { ToolkitAiDraft, type SkillDraft } from "./ToolkitAiDraft";
import { ToolkitComposerField } from "./ToolkitComposerField";
import { ToolkitSkillModal } from "./ToolkitSkillModal";
import { ToolkitSkillOptions } from "./ToolkitSkillOptions";
import { FIELD } from "./surfaces";

function Notice({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  return (
    <p
      className={`shrink-0 rounded-[var(--tk-radius)] px-3 py-2.5 text-[11.5px] leading-snug ${
        tone === "bad"
          ? "bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--bg-primary))] text-[var(--accent-red-text)]"
          : "bg-[var(--tk-fault)] text-[var(--accent-amber-text)]"
      }`}
    >
      {children}
    </p>
  );
}

interface ToolkitCreateProps {
  cwd: string;
  roots: CapabilityRoot[];
  items: AgentCapability[];
  truncated: boolean;
  cli: "all" | "claude" | "codex";
  seedName: string;
  // The tab this was opened from is showing. A hidden tab hides the dialog
  // without unmounting it, so switching away and back keeps the draft.
  open: boolean;
  onBack: () => void;
  onCreated: (path: string) => void;
  onOpenExisting: (path: string) => void;
}

// A dialog rather than a sub-view of the pane: the pane can sit at 300px beside
// a terminal, which is narrower than this form deserves, and writing a skill is
// a detour from reading the list rather than a place in it. The folder and who
// may run it are cards under the name rather than a summary line: the folders
// are told apart by the path they write to, and that is worth the height.
export function ToolkitCreate({
  cwd,
  roots,
  items,
  truncated,
  cli,
  seedName,
  open,
  onBack,
  onCreated,
  onOpenExisting,
}: ToolkitCreateProps) {
  const destinations = useMemo(() => skillDestinations(roots), [roots]);
  const [name, setName] = useState(() => skillNameDraft(seedName));
  const [description, setDescription] = useState<ComposerValue>(EMPTY_COMPOSER);
  const [manual, setManual] = useState(false);
  const [instructions, setInstructions] = useState<ComposerValue>(EMPTY_COMPOSER);
  // Bumped whenever the form writes the prose fields itself; see the field.
  const [seed, setSeed] = useState(0);
  const [aiRequest, setAiRequest] = useState<ComposerValue>(EMPTY_COMPOSER);
  const [destPath, setDestPath] = useState(() => defaultDestination(destinations, cli));
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // The dialog takes focus itself as it opens, so the field has to wait a beat
  // to survive it.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  // A re-scan behind the sub-view can drop the chosen folder. Falling back
  // keeps a destination selected rather than greying out Create with nothing
  // to point at.
  useEffect(() => {
    if (destinations.some((d) => d.path === destPath)) return;
    setDestPath(defaultDestination(destinations, cli));
  }, [destinations, destPath, cli]);

  const finalName = skillName(name);
  // The composer serializes attachments into the text, so the prose the file
  // will carry is what every check below reads.
  const descriptionText = composerValueToText(description);
  const instructionsText = composerValueToText(instructions);
  const dest = destinations.find((d) => d.path === destPath) ?? null;
  const nameError = finalName ? skillNameError(finalName) : null;
  const descriptionError = skillDescriptionError(descriptionText);
  const instructionsError = skillInstructionsError(instructionsText);
  const clash = useMemo(
    () => skillClash(finalName, dest, items, truncated),
    [finalName, dest, items, truncated],
  );

  const manualAllowed = dest?.cli === "claude" || dest?.cli === "codex";
  const manualOn = manual && manualAllowed;
  const invocation = `${dest?.cli === "codex" ? "$" : "/"}${finalName || "name"}`;

  // Against the seed, not against empty: arriving from the "no matches" button
  // with the name already filled in is not an edit worth guarding.
  const dirty =
    name !== skillNameDraft(seedName) ||
    Boolean(descriptionText) ||
    Boolean(instructionsText) ||
    Boolean(composerValueToText(aiRequest).trim()) ||
    manual;
  const blocked =
    !dest ||
    !finalName ||
    Boolean(nameError) ||
    Boolean(descriptionError) ||
    Boolean(instructionsError) ||
    clash?.tone === "bad";

  const submit = useCallback(async () => {
    if (blocked || busy || !dest) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    try {
      const path = (await CreateAgentSkill(
        cwd,
        dest.path,
        finalName,
        skillTemplate(finalName, descriptionText, manualOn, instructionsText),
        manualOn,
      )) as string;
      onCreated(path);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  }, [
    blocked,
    busy,
    dest,
    cwd,
    finalName,
    descriptionText,
    manualOn,
    instructionsText,
    onCreated,
  ]);

  // An error belongs at its field, but a form nobody has touched yet is not
  // wrong — it is empty. So the missing description is a muted line in the
  // footer, saying why Create is off, and only turns red at the field once
  // there is prose to be wrong or the user has tried to create it.
  const descriptionFault = attempted || descriptionText ? descriptionError : null;
  const instructionsFault = attempted || instructionsText ? instructionsError : null;
  const hint =
    nameError || descriptionFault || instructionsFault
      ? null
      : finalName
        ? (descriptionError ?? instructionsError)
        : null;

  // The draft lands in the fields, never in a file: review starts at the name,
  // and Create stays the only thing that writes. Drafted instructions unfold with it —
  // a draft the user cannot see is not something they can review. Prose it
  // pushed out comes back on one click: the draft replaces typed text without
  // asking, and a written-out description is not something to retype.
  const applyDraft = (draft: SkillDraft) => {
    const prev = { name, description, instructions };
    setName(skillNameDraft(draft.name));
    setDescription(textToPrompt(draft.description));
    setInstructions(textToPrompt(draft.body));
    setSeed((n) => n + 1);
    nameRef.current?.focus();
    const lost =
      (descriptionText && descriptionText !== draft.description) ||
      (instructionsText && instructionsText !== draft.body);
    if (!lost) return;
    toast("The draft replaced what you had typed", {
      action: {
        label: "Undo",
        onClick: () => {
          setName(prev.name);
          setDescription(prev.description);
          setInstructions(prev.instructions);
          setSeed((n) => n + 1);
        },
      },
    });
  };

  return (
    <ToolkitSkillModal
      open={open}
      title="New skill"
      subtitle="A task your agent can run on its own, saved where the CLI you pick will read it."
      hint={hint ?? (blocked ? "" : "↩ creates it and opens it")}
      submitLabel="Create skill"
      busyLabel="Creating…"
      busy={busy}
      blocked={blocked}
      dirty={dirty && !busy}
      discardTitle="Discard this skill?"
      discardBody="Nothing has been written yet."
      onClose={onBack}
      onSubmit={() => void submit()}
    >
      <ToolkitAiDraft
        cwd={cwd}
        nameHint={finalName}
        request={aiRequest}
        onRequest={setAiRequest}
        onDraft={applyDraft}
      />

      <div className="flex flex-col gap-1">
        <label className={LABEL} htmlFor="toolkit-skill-name">
          Name
        </label>
        <input
          id="toolkit-skill-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(skillNameDraft(e.target.value))}
          placeholder="deploy-web"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className={`${FIELD} w-full`}
        />
        {nameError ? (
          <p className="text-[11px] leading-snug text-[var(--accent-red-text)]">{nameError}</p>
        ) : (
          <p className="truncate font-mono text-[11.5px] text-[var(--text-muted)]">
            {finalName && dest
              ? shortPath(skillFilePath(dest.path, finalName))
              : "Name it and this is where it goes."}
          </p>
        )}
        {dest?.scope === "project" && (
          <p className={LABEL}>Saved with the project, so everyone working on it gets it.</p>
        )}
      </div>

      <ToolkitSkillOptions
        destinations={destinations}
        destPath={destPath}
        onDest={setDestPath}
        manual={manualOn}
        manualAllowed={manualAllowed}
        onManual={setManual}
        invocation={invocation}
      />

      <SkillDescriptionField
        value={description}
        text={descriptionText}
        onChange={setDescription}
        seed={seed}
        cwd={cwd}
        cli={dest?.cli ?? ""}
        manual={manualOn}
        invocation={invocation}
        nameLength={finalName.length}
        error={descriptionFault}
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
        error={instructionsFault}
      />

      {clash && (
        <Notice tone={clash.tone}>
          {clash.text}
          {clash.tone === "bad" && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onOpenExisting(clash.existingPath)}
                className="underline decoration-dotted underline-offset-2"
              >
                Open it
              </button>
            </>
          )}
        </Notice>
      )}
    </ToolkitSkillModal>
  );
}
