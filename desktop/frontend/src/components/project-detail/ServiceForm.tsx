import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  appendService,
  renameService,
  replaceService,
  type ServicePatch,
} from "../../serviceConfig";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";
import type { ProfileInfo, ServiceInfo } from "../../types";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon, XIcon } from "../icons";
import { Modal } from "../ui/Modal";
import { StartMenuPreview } from "./StartMenuPreview";

const FALLBACK_KEY = "new-service";
const PORT_MIN = 1;
const PORT_MAX = 65535;

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]";

const textareaClass =
  "w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]";

const envInputClass =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]";

interface EnvDraft {
  id: string;
  key: string;
  value: string;
}

interface ServiceFormProps {
  open: boolean;
  projectName: string;
  // All current services in the project — used to render a realistic preview
  // and to avoid YAML key collisions on create.
  services: ServiceInfo[];
  // All current profiles — rendered in the preview so the menu mirrors what
  // the user sees in the live UI.
  profiles: ProfileInfo[];
  // When set, the form runs in edit mode: prefill from this service and patch
  // its YAML key in place. Renames are applied first when the name changes.
  editing?: ServiceInfo | null;
  onClose: () => void;
  onSaved: () => void;
  // Click on a non-draft preview row swaps the modal to that entry. Profile
  // clicks cross-route to the ProfileForm; service clicks switch the service
  // being edited.
  onPickService?: (service: ServiceInfo) => void;
  onPickProfile?: (profile: ProfileInfo) => void;
}

function envFromRecord(env?: Record<string, string>): EnvDraft[] {
  if (!env) return [];
  return Object.entries(env).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
  }));
}

function envToRecord(envs: EnvDraft[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of envs) {
    const trimmed = key.trim();
    if (trimmed) out[trimmed] = value;
  }
  return out;
}

function parsePort(raw: string): { value: number; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: 0, valid: true };
  const value = Number.parseInt(trimmed, 10);
  const valid = Number.isFinite(value) && value >= PORT_MIN && value <= PORT_MAX;
  return { value, valid };
}

interface ServiceDraft {
  trimmedName: string;
  trimmedCmd: string;
  trimmedCwd: string;
  port: number;
  envObj: Record<string, string>;
}

function buildPayload(draft: ServiceDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = { cmd: draft.trimmedCmd };
  if (draft.trimmedCwd) payload.cwd = draft.trimmedCwd;
  if (draft.port > 0) payload.port = draft.port;
  if (Object.keys(draft.envObj).length > 0) payload.env = draft.envObj;
  return payload;
}

function buildPatch(payload: Record<string, unknown>): ServicePatch {
  // Explicitly remove fields the user cleared so stale values don't linger
  // from the previous YAML.
  const remove: string[] = [];
  for (const field of ["cwd", "port", "env"] as const) {
    if (payload[field] === undefined) remove.push(field);
  }
  return { set: payload, remove };
}

export function ServiceForm({
  open,
  projectName,
  services,
  profiles,
  editing,
  onClose,
  onSaved,
  onPickService,
  onPickProfile,
}: ServiceFormProps) {
  const isEditing = Boolean(editing);
  const [name, setName] = useState("");
  const [cmd, setCmd] = useState("");
  const [cwd, setCwd] = useState("");
  const [port, setPort] = useState("");
  const [env, setEnv] = useState<EnvDraft[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCmd(editing.cmd);
      setCwd(editing.cwd ?? "");
      setPort(editing.port > 0 ? String(editing.port) : "");
      setEnv(envFromRecord(editing.env));
      // Auto-expand Advanced when any optional field is already set, so the
      // user can see existing values without hunting for the disclosure.
      setAdvancedOpen(
        Boolean(editing.cwd) ||
          editing.port > 0 ||
          Object.keys(editing.env ?? {}).length > 0,
      );
    } else {
      setName("");
      setCmd("");
      setCwd("");
      setPort("");
      setEnv([]);
      setAdvancedOpen(false);
    }
    setSaving(false);
    const focusTimer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [open, editing]);

  const trimmedName = name.trim();
  const trimmedCmd = cmd.trim();
  const trimmedCwd = cwd.trim();
  const { value: portValue, valid: portValid } = parsePort(port);

  // Names of all services *other than* the one currently being edited. Used
  // to guard against collisions when creating or renaming.
  const otherServiceKeys = useMemo(
    () => services.filter((s) => !editing || s.name !== editing.name).map((s) => s.name),
    [services, editing],
  );

  const desiredKey = useMemo(() => {
    const slug = slugify(trimmedName);
    if (editing) return slug || editing.name;
    return uniqueKey(slug || FALLBACK_KEY, services.map((s) => s.name));
  }, [editing, services, trimmedName]);

  const renameCollision = isEditing && otherServiceKeys.includes(desiredKey);

  const errorHint = !trimmedName
    ? "Name is required"
    : !trimmedCmd
      ? "Command is required"
      : !portValid
        ? `Port must be ${PORT_MIN}–${PORT_MAX}`
        : renameCollision
          ? `A service named "${desiredKey}" already exists`
          : "";

  const canSave = !errorHint && !saving;

  const draft = useMemo<ServiceDraft>(
    () => ({
      trimmedName,
      trimmedCmd,
      trimmedCwd,
      port: portValid ? portValue : 0,
      envObj: envToRecord(env),
    }),
    [trimmedName, trimmedCmd, trimmedCwd, portValid, portValue, env],
  );

  const previewServiceEntries = useMemo(() => {
    const others = services.filter((s) => !editing || s.name !== editing.name);
    const draftService: ServiceInfo = {
      name: desiredKey,
      cmd: draft.trimmedCmd,
      cwd: draft.trimmedCwd,
      port: draft.port,
    };
    const list = [...others, draftService];
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.map((s) => ({ service: s, isDraft: s === draftService }));
  }, [services, editing, desiredKey, draft]);

  const previewProfileEntries = useMemo(
    () => profiles.map((p) => ({ profile: p, isDraft: false })),
    [profiles],
  );

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = buildPayload(draft);
      if (editing) {
        await renameService(projectName, editing.name, desiredKey);
        await replaceService(projectName, desiredKey, buildPatch(payload));
        toast.success("Service updated");
      } else {
        await appendService(projectName, desiredKey, payload);
        toast.success("Service created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = editing ? "Could not update service" : "Could not create service";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        className="flex max-h-[88vh] w-[min(880px,calc(100vw-32px))] flex-col"
        onKeyDown={onKeyDown}
      >
        <header className="flex items-start justify-between gap-4 px-8 pb-6 pt-7">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {isEditing ? "Edit service" : "Add service"}
            </h2>
            <p className="mt-2 max-w-[560px] text-[13px] leading-5 text-[var(--text-secondary)]">
              Services are long-running processes started with the project — dev servers,
              workers, databases.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-5">
              <Field label="Name" hint="Lowercase letters, digits, dashes.">
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="api"
                  className={inputClass}
                />
              </Field>

              <Field label="Command" hint="What you would type in a terminal to start it.">
                <textarea
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  placeholder="npm run dev"
                  rows={2}
                  className={textareaClass}
                />
              </Field>

              <AdvancedSection
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((v) => !v)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Field
                      label="Working directory"
                      hint="Relative to project root or absolute."
                    >
                      <input
                        value={cwd}
                        onChange={(e) => setCwd(e.target.value)}
                        placeholder="apps/api"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Field label="Port">
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="3000"
                      inputMode="numeric"
                      className={
                        inputClass + (portValid ? "" : " border-[var(--accent-red,#dc2626)]")
                      }
                    />
                  </Field>
                </div>

                <EnvEditor entries={env} onChange={setEnv} />
              </AdvancedSection>
            </div>
          </div>

          <StartMenuPreview
            services={previewServiceEntries}
            profiles={previewProfileEntries}
            onPickService={onPickService}
            onPickProfile={onPickProfile}
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {!canSave && errorHint && (
              <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
                {errorHint}
              </span>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSave}
              className="rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-semibold text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "Saving..." : isEditing ? "Save changes" : "Add service"}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function AdvancedSection({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--border)] pt-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        Advanced
      </button>
      {open && <div className="mt-4 space-y-5">{children}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[11px] text-[var(--text-muted)]">{hint}</span>
      )}
    </label>
  );
}

function EnvEditor({
  entries,
  onChange,
}: {
  entries: EnvDraft[];
  onChange: (entries: EnvDraft[]) => void;
}) {
  const update = (id: string, patch: Partial<EnvDraft>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const remove = (id: string) => onChange(entries.filter((entry) => entry.id !== id));
  const add = () =>
    onChange([...entries, { id: crypto.randomUUID(), key: "", value: "" }]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          Environment variables
        </span>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon /> Add
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-[12px] text-[var(--text-muted)]">
          No env vars set. Click <span className="font-medium">Add</span> to define one.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <input
                value={entry.key}
                onChange={(ev) => update(entry.id, { key: ev.target.value })}
                placeholder="KEY"
                className={`${envInputClass} w-[40%]`}
              />
              <input
                value={entry.value}
                onChange={(ev) => update(entry.id, { value: ev.target.value })}
                placeholder="value"
                className={`${envInputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => remove(entry.id)}
                aria-label="Remove variable"
                className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
