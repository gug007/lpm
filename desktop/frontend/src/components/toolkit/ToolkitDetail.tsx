import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ReadAgentCapability,
  UpdateAgentSkill,
  WriteAgentCapability,
} from "../../../bridge/commands";
import type { AgentCapability, CapabilityDoc } from "../../toolkit";
import {
  CLI_LABELS,
  KIND_LABELS,
  capabilityIssue,
  formatTokens,
  manualOnly,
  scopeLabel,
  shortPath,
  splitFrontmatter,
  upfrontBytes,
} from "../../toolkit";
import {
  SKILL_DESCRIPTION_MAX,
  isSharedSkillsDir,
  skillDescription,
  skillDescriptionError,
} from "../../toolkitSkill";
import { ChevronLeftIcon, TrashIcon } from "../icons";
import { MessageMarkdown } from "../MessageMarkdown";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { SegmentedControl } from "../ui/SegmentedControl";
import { LABEL } from "./OptionCard";
import { ToolkitDeleteDialog } from "./ToolkitDeleteDialog";
import { ToolkitFrontmatter } from "./ToolkitFrontmatter";
import { ToolkitRunMode } from "./ToolkitRunMode";
import { ToolkitSource } from "./ToolkitSource";
import { SURFACE_TOKENS, TEXTAREA } from "./surfaces";

const humanBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

type View = "doc" | "edit" | "source";

interface ToolkitDetailProps {
  cap: AgentCapability;
  cwd: string;
  // Short paths of same-named copies elsewhere, so the confirmation can say
  // which ones survive. Computed by the list, which already holds every item.
  siblingPaths: string[];
  deletable: boolean;
  active: boolean;
  onBack: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function ToolkitDetail({
  cap,
  cwd,
  siblingPaths,
  deletable,
  active,
  onBack,
  onSaved,
  onDeleted,
}: ToolkitDetailProps) {
  const [doc, setDoc] = useState<CapabilityDoc | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("doc");
  const [confirming, setConfirming] = useState(false);
  const [description, setDescription] = useState("");
  const [manual, setManual] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = (await ReadAgentCapability(cap.path)) as CapabilityDoc;
      setDoc(result);
      setDraft(result.content);
      setBaseline(result.content);
      setError("");
    } catch (err) {
      setError(String(err));
      setDoc(null);
    }
  }, [cap.path]);

  useEffect(() => {
    setView("doc");
    void load();
  }, [load]);

  const dirty = draft !== baseline;

  // What the file says now, against what the form is offering to write. Both
  // are values rather than objects, so a refresh that hands back an equal
  // capability cannot reset a form somebody is typing into.
  const savedDescription = useMemo(() => skillDescription(doc?.content ?? ""), [doc?.content]);
  const savedManual = manualOnly(cap);
  const resetForm = useCallback(() => {
    setDescription(savedDescription);
    setManual(savedManual);
  }, [savedDescription, savedManual]);
  useEffect(resetForm, [resetForm]);

  const descriptionError = skillDescriptionError(description);
  const edited = description !== savedDescription || manual !== savedManual;

  // Escape returns to the list, but never discards an unsaved edit silently.
  // Gated on `active` and left in the bubble phase: an inactive tab is hidden
  // rather than unmounted, so a capture-phase listener here would swallow
  // Escape for whatever the user is actually looking at.
  useEffect(() => {
    if (!active || dirty || edited || confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, dirty, edited, confirming, onBack]);

  const save = async () => {
    setSaving(true);
    try {
      await WriteAgentCapability(cap.path, draft, baseline);
      setBaseline(draft);
      toast.success("Saved");
      onSaved();
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

  const saveForm = async () => {
    if (saving || !edited || descriptionError) return;
    setSaving(true);
    try {
      await UpdateAgentSkill(cwd, cap.path, baseline, description.trim(), manual);
      toast.success("Saved");
      await load();
      onSaved();
      setView("doc");
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

  // Leaving the form throws away what it holds, so coming back to it always
  // starts from the file.
  const show = (next: View) => {
    if (next !== "edit") resetForm();
    setView(next);
  };

  const parsed = useMemo(() => splitFrontmatter(doc?.content ?? ""), [doc?.content]);
  const upfront = upfrontBytes(cap);
  const issue = capabilityIssue(cap);
  const editable = Boolean(doc?.editable);
  // `cap.editable` is already false for a plugin-owned skill, so plugins need
  // no separate check here.
  const ownSkill = deletable && cap.kind === "skill" && cap.editable;
  const invocation = `${cap.cli === "codex" ? "$" : "/"}${cap.name}`;
  const skillRoot = cap.path.replace(/\/[^/]+\/SKILL\.md$/, "");
  const views: { value: View; label: string; disabled?: boolean }[] = [
    { value: "doc", label: "Doc" },
    ...(ownSkill ? [{ value: "edit" as const, label: "Edit", disabled: dirty }] : []),
    { value: "source", label: "Source" },
  ];

  return (
    // The surface tokens the form's fields and cards mix their colours from:
    // this is a sub-view of the pane rather than something inside its root, and
    // an undefined custom property paints nothing at all.
    <div style={SURFACE_TOKENS} className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5">
        <button
          onClick={onBack}
          title="Back to the list (esc)"
          aria-label="Back to the list"
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeftIcon />
        </button>
        <span className="truncate font-mono text-[13px] text-[var(--text-primary)]">
          {cap.name}
        </span>
        {dirty && (
          <span className="shrink-0 text-[10px] text-[var(--accent-amber-text)]">unsaved</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {ownSkill && (
            <button
              onClick={() => setConfirming(true)}
              disabled={dirty}
              title={dirty ? "Save or revert your changes first" : "Delete this skill"}
              aria-label="Delete this skill"
              className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          )}
          <SegmentedControl
            value={view}
            options={views}
            onChange={(v) => show(v as View)}
            variant="subtle"
            ariaLabel="Capability view"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {KIND_LABELS[cap.kind]} · {scopeLabel(cap.scope)} · {CLI_LABELS[cap.cli] ?? cap.cli}
        </span>
        {cap.detail && cap.kind !== "mcp" && (
          <span className="text-[10px] text-[var(--text-muted)]">from {cap.detail}</span>
        )}
        {manualOnly(cap) ? (
          <span className="text-[10px] text-[var(--text-muted)]">
            runs only when you type {invocation} — costs no context until then
          </span>
        ) : (
          upfront > 0 && (
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
              ~{formatTokens(upfront)} tokens always in context
            </span>
          )
        )}
        {cap.bytes > 0 && (
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
            {humanBytes(cap.bytes)} on disk
          </span>
        )}
        <span
          className="ml-auto min-w-0 shrink truncate font-mono text-[10px] text-[var(--text-muted)]"
          title={cap.path}
        >
          {shortPath(cap.path)}
        </span>
        <OpenFileWithDropdown absPath={cap.path} line={1} col={1} />
      </div>

      {issue && (
        <p className="border-b border-[var(--border)] bg-[var(--bg-hover)] px-3 py-1.5 text-[11px] leading-snug text-[var(--accent-amber-text)]">
          {issue}
        </p>
      )}

      {error ? (
        <p className="px-4 py-6 text-[12px] text-[var(--accent-red-text)]">{error}</p>
      ) : view === "source" || !doc ? (
        <ToolkitSource
          draft={draft}
          baseline={baseline}
          editable={editable}
          saving={saving}
          onChange={setDraft}
          onSave={save}
          onRevert={() => setDraft(baseline)}
        />
      ) : view === "edit" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveForm();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void saveForm();
            }
          }}
          className="@container flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            <ToolkitRunMode
              cli={cap.cli}
              shared={cap.cli === "codex" && isSharedSkillsDir(skillRoot)}
              manual={manual}
              manualAllowed={cap.cli === "claude" || cap.cli === "codex"}
              onManual={setManual}
              invocation={invocation}
            />

            <div className="flex flex-col gap-1">
              <label className={LABEL} htmlFor="toolkit-skill-edit-description">
                What it does, and when to use it
              </label>
              <textarea
                id="toolkit-skill-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Ship the site to staging. Use when asked to deploy, release or push the web app."
                className={TEXTAREA}
              />
              <div className="flex items-baseline justify-between gap-3 text-[11px] tabular-nums text-[var(--text-muted)]">
                <span className="min-w-0 flex-1 truncate">{descriptionError ?? ""}</span>
                <span
                  className={
                    description.length > SKILL_DESCRIPTION_MAX
                      ? "text-[var(--accent-red-text)]"
                      : ""
                  }
                >
                  {description.length} / {SKILL_DESCRIPTION_MAX}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onClick={() => show("doc")}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !edited || Boolean(descriptionError)}
              title="⌘↩"
              className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ToolkitFrontmatter fields={parsed.fields} />
          {parsed.body.trim() ? (
            <MessageMarkdown text={parsed.body} />
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">
              No prose in this file — see Source for the full definition.
            </p>
          )}
        </div>
      )}

      {ownSkill && (
        <ToolkitDeleteDialog
          cwd={cwd}
          cap={cap}
          siblingPaths={siblingPaths}
          open={confirming}
          onCancel={() => setConfirming(false)}
          onDeleted={() => {
            setConfirming(false);
            onDeleted();
          }}
        />
      )}
    </div>
  );
}
