import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CreateAgentSkill } from "../../../bridge/commands";
import type { AgentCapability, CapabilityRoot } from "../../toolkit";
import { estimateTokens, formatTokenCount, shortPath } from "../../toolkit";
import {
  SKILL_DESCRIPTION_MAX,
  defaultDestination,
  skillClash,
  skillDescriptionError,
  skillDestinations,
  skillFilePath,
  skillName,
  skillNameDraft,
  skillNameError,
  skillTemplate,
} from "../../toolkitSkill";
import { ChevronLeftIcon } from "../icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ToolkitDestinations } from "./ToolkitDestinations";
import { FIELD, SURFACE_TOKENS, TEXTAREA } from "./surfaces";

const LABEL = "text-[10.5px] text-[var(--text-muted)]";

function Notice({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  return (
    <p
      className={`shrink-0 rounded-[var(--tk-radius)] px-3 py-2 text-[10.5px] leading-snug ${
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
  active: boolean;
  onBack: () => void;
  onCreated: (path: string) => void;
  onOpenExisting: (path: string) => void;
}

// A sub-view of the pane, not a dialog: the pane can sit at 300px beside a
// terminal, and it already teaches list ⇄ detail ⇄ esc. Three fields, because
// the description is the only part that costs context on every turn and the
// only part that decides whether the agent ever opens the file.
export function ToolkitCreate({
  cwd,
  roots,
  items,
  truncated,
  cli,
  seedName,
  active,
  onBack,
  onCreated,
  onOpenExisting,
}: ToolkitCreateProps) {
  const destinations = useMemo(() => skillDestinations(roots), [roots]);
  const [name, setName] = useState(() => skillNameDraft(seedName));
  const [description, setDescription] = useState("");
  const [destPath, setDestPath] = useState(() => defaultDestination(destinations, cli));
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // The pane is still committing the sub-view when this mounts, so the focus
  // has to wait a beat to survive it.
  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // A re-scan behind the sub-view can drop the chosen folder. Falling back
  // keeps a destination selected rather than greying out Create with nothing
  // to point at.
  useEffect(() => {
    if (destinations.some((d) => d.path === destPath)) return;
    setDestPath(defaultDestination(destinations, cli));
  }, [destinations, destPath, cli]);

  const finalName = skillName(name);
  const dest = destinations.find((d) => d.path === destPath) ?? null;
  const nameError = finalName ? skillNameError(finalName) : null;
  const descriptionError = skillDescriptionError(description);
  const clash = useMemo(
    () => skillClash(finalName, dest, items, truncated),
    [finalName, dest, items, truncated],
  );

  // Against the seed, not against empty: arriving from the "no matches" button
  // with the name already filled in is not an edit worth guarding.
  const dirty = name !== skillNameDraft(seedName) || Boolean(description);
  const blocked =
    !dest ||
    !finalName ||
    Boolean(nameError) ||
    Boolean(descriptionError) ||
    clash?.tone === "bad";

  const close = useCallback(() => {
    if (dirty) setDiscarding(true);
    else onBack();
  }, [dirty, onBack]);

  // Same shape as the detail view's: gated on `active` and left in the bubble
  // phase, because an inactive tab is hidden rather than unmounted and would
  // otherwise swallow Escape for whatever the user is actually looking at.
  useEffect(() => {
    if (!active || discarding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, discarding, close]);

  const submit = async () => {
    if (blocked || busy || !dest) return;
    setBusy(true);
    try {
      const path = (await CreateAgentSkill(
        cwd,
        dest.path,
        finalName,
        skillTemplate(finalName, description.trim()),
      )) as string;
      onCreated(path);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  // Nothing until there is a name: an empty form is not a mistake yet.
  const hint = nameError ?? (finalName ? descriptionError : null);

  return (
    // The sub-view replaces the pane's own root, so it has to carry the surface
    // tokens itself — the fields and the clash notice mix their colours from
    // them, and an undefined custom property paints nothing at all.
    <div
      style={SURFACE_TOKENS}
      className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5">
        <button
          type="button"
          onClick={close}
          title="Back to the list (esc)"
          aria-label="Back to the list"
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeftIcon />
        </button>
        <span className="truncate text-[13px] text-[var(--text-primary)]">New skill</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-1">
            <label className={LABEL} htmlFor="toolkit-skill-name">
              Name
            </label>
            <input
              id="toolkit-skill-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(skillNameDraft(e.target.value))}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`${FIELD} h-[30px] w-full`}
            />
            <p className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">
              {finalName && dest
                ? shortPath(skillFilePath(dest.path, finalName))
                : "Name it and this is where it goes."}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className={LABEL}>Where it goes</span>
            <ToolkitDestinations
              destinations={destinations}
              value={destPath}
              onChange={setDestPath}
            />
            {dest?.scope === "project" && (
              <p className={LABEL}>
                Saved with the project, so everyone working on it gets it.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className={LABEL} htmlFor="toolkit-skill-description">
              What it does, and when to use it
            </label>
            <textarea
              id="toolkit-skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Ship the site to staging. Use when asked to deploy, release or push the web app."
              className={TEXTAREA}
            />
            <p className={LABEL}>
              This is the only part your agent reads before deciding to open the skill.
            </p>
            <div className="flex items-baseline justify-between gap-3 text-[10px] tabular-nums text-[var(--text-muted)]">
              {/* The same bytes the pane counts for an installed skill: its
                  name and its description, and nothing else. */}
              <span>
                {`Adds ~${formatTokenCount(
                  estimateTokens(finalName.length + description.length),
                )} tokens to every turn`}
              </span>
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
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
            {hint}
          </span>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={blocked || busy}
            className="rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create skill"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={discarding}
        title="Discard this skill?"
        body="Nothing has been written yet."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onCancel={() => setDiscarding(false)}
        onConfirm={onBack}
      />
    </div>
  );
}
