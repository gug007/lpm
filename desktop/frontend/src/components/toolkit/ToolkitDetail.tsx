import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ReadAgentCapability, WriteAgentCapability } from "../../../bridge/commands";
import type { AgentCapability, CapabilityDoc } from "../../toolkit";
import {
  CLI_LABELS,
  KIND_LABELS,
  capabilityIssue,
  formatTokens,
  scopeLabel,
  shortPath,
  splitFrontmatter,
  upfrontBytes,
} from "../../toolkit";
import { ChevronLeftIcon } from "../icons";
import { MessageMarkdown } from "../MessageMarkdown";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ToolkitFrontmatter } from "./ToolkitFrontmatter";
import { ToolkitSource } from "./ToolkitSource";

const humanBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

type View = "doc" | "source";

interface ToolkitDetailProps {
  cap: AgentCapability;
  onBack: () => void;
  onSaved: () => void;
}

export function ToolkitDetail({ cap, onBack, onSaved }: ToolkitDetailProps) {
  const [doc, setDoc] = useState<CapabilityDoc | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("doc");

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

  // Escape returns to the list, but never discards an unsaved edit silently.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dirty) return;
      e.stopPropagation();
      onBack();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dirty, onBack]);

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

  const parsed = useMemo(() => splitFrontmatter(doc?.content ?? ""), [doc?.content]);
  const upfront = upfrontBytes(cap);
  const issue = capabilityIssue(cap);
  const editable = Boolean(doc?.editable);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]">
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
          <span className="shrink-0 text-[10px] text-[var(--accent-amber)]">unsaved</span>
        )}
        <div className="ml-auto shrink-0">
          <SegmentedControl
            value={view}
            options={[
              { value: "doc", label: "Doc" },
              { value: "source", label: "Source" },
            ]}
            onChange={(v) => setView(v as View)}
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
        {upfront > 0 && (
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
            ~{formatTokens(upfront)} tokens always in context
          </span>
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
        <p className="border-b border-[var(--border)] bg-[var(--bg-hover)] px-3 py-1.5 text-[11px] leading-snug text-[var(--accent-amber)]">
          {issue}
        </p>
      )}

      {error ? (
        <p className="px-4 py-6 text-[12px] text-[var(--accent-red)]">{error}</p>
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
    </div>
  );
}
