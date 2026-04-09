import { useState, useCallback, useEffect } from "react";
import YAML from "yaml";
import { ReadConfig, SaveConfig } from "../../wailsjs/go/main/App";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { AddNewPicker, type NewItemType } from "./AddNewPicker";
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from "./icons";

// ── form state types ──

interface ServiceEntry {
  key: string;
  cmd: string;
  cwd: string;
  port: string;
  env: [string, string][];
}

interface ActionEntry {
  key: string;
  cmd: string;
  label: string;
  cwd: string;
  env: [string, string][];
  confirm: boolean;
  display: string;
  type: string;
}

interface TerminalEntry {
  key: string;
  cmd: string;
  label: string;
  cwd: string;
  env: [string, string][];
  display: string;
}

interface ProfileEntry {
  key: string;
  services: string[];
}

interface ConfigForm {
  name: string;
  root: string;
  services: ServiceEntry[];
  actions: ActionEntry[];
  terminals: TerminalEntry[];
  profiles: ProfileEntry[];
}

// ── parse / serialize ──

function parseYaml(yaml: string): ConfigForm {
  const raw = YAML.parse(yaml) || {};
  return {
    name: raw.name || "",
    root: raw.root || "",
    services: Object.entries((raw.services as Record<string, unknown>) || {}).map(([key, v]) => {
      const isStr = typeof v === "string";
      const obj = isStr ? {} : (v as Record<string, unknown>);
      return {
        key,
        cmd: isStr ? (v as string) : String(obj.cmd || ""),
        cwd: String(obj.cwd || ""),
        port: obj.port ? String(obj.port) : "",
        env: Object.entries((obj.env as Record<string, string>) || {}),
      };
    }),
    actions: Object.entries((raw.actions as Record<string, unknown>) || {}).map(([key, v]) => {
      const isStr = typeof v === "string";
      const obj = isStr ? {} : (v as Record<string, unknown>);
      return {
        key,
        cmd: isStr ? (v as string) : String(obj.cmd || ""),
        label: String(obj.label || ""),
        cwd: String(obj.cwd || ""),
        env: Object.entries((obj.env as Record<string, string>) || {}),
        confirm: Boolean(obj.confirm),
        display: String(obj.display || ""),
        type: String(obj.type || ""),
      };
    }),
    terminals: Object.entries((raw.terminals as Record<string, unknown>) || {}).map(([key, v]) => {
      const isStr = typeof v === "string";
      const obj = isStr ? {} : (v as Record<string, unknown>);
      return {
        key,
        cmd: isStr ? (v as string) : String(obj.cmd || ""),
        label: String(obj.label || ""),
        cwd: String(obj.cwd || ""),
        env: Object.entries((obj.env as Record<string, string>) || {}),
        display: String(obj.display || ""),
      };
    }),
    profiles: Object.entries((raw.profiles as Record<string, string[]>) || {}).map(([key, v]) => ({
      key,
      services: Array.isArray(v) ? v : [],
    })),
  };
}

function serializeToYaml(form: ConfigForm): string {
  const doc: Record<string, unknown> = {};
  if (form.name) doc.name = form.name;
  if (form.root) doc.root = form.root;

  if (form.services.length > 0) {
    const svcs: Record<string, unknown> = {};
    for (const s of form.services) {
      if (!s.key) continue;
      const hasExtras = s.cwd || s.port || s.env.length > 0;
      if (!hasExtras) {
        svcs[s.key] = s.cmd;
      } else {
        const obj: Record<string, unknown> = { cmd: s.cmd };
        if (s.cwd) obj.cwd = s.cwd;
        if (s.port) obj.port = parseInt(s.port, 10) || 0;
        if (s.env.length > 0) obj.env = Object.fromEntries(s.env.filter(([k]) => k));
        svcs[s.key] = obj;
      }
    }
    doc.services = svcs;
  }

  if (form.actions.length > 0) {
    const acts: Record<string, unknown> = {};
    for (const a of form.actions) {
      if (!a.key) continue;
      const hasExtras = a.label || a.cwd || a.env.length > 0 || a.confirm || a.display || a.type;
      if (!hasExtras) {
        acts[a.key] = a.cmd;
      } else {
        const obj: Record<string, unknown> = { cmd: a.cmd };
        if (a.label) obj.label = a.label;
        if (a.cwd) obj.cwd = a.cwd;
        if (a.env.length > 0) obj.env = Object.fromEntries(a.env.filter(([k]) => k));
        if (a.confirm) obj.confirm = true;
        if (a.display) obj.display = a.display;
        if (a.type) obj.type = a.type;
        acts[a.key] = obj;
      }
    }
    doc.actions = acts;
  }

  if (form.terminals.length > 0) {
    const terms: Record<string, unknown> = {};
    for (const t of form.terminals) {
      if (!t.key) continue;
      const hasExtras = t.label || t.cwd || t.env.length > 0 || t.display;
      if (!hasExtras) {
        terms[t.key] = t.cmd;
      } else {
        const obj: Record<string, unknown> = { cmd: t.cmd };
        if (t.label) obj.label = t.label;
        if (t.cwd) obj.cwd = t.cwd;
        if (t.env.length > 0) obj.env = Object.fromEntries(t.env.filter(([k]) => k));
        if (t.display) obj.display = t.display;
        terms[t.key] = obj;
      }
    }
    doc.terminals = terms;
  }

  if (form.profiles.length > 0) {
    const profs: Record<string, string[]> = {};
    for (const p of form.profiles) {
      if (!p.key) continue;
      profs[p.key] = p.services.filter(Boolean);
    }
    doc.profiles = profs;
  }

  return YAML.stringify(doc, { lineWidth: 0 });
}

// ── helpers ──

function uniqueKey(prefix: string, existing: string[]): string {
  if (!existing.includes(prefix)) return prefix;
  let i = 2;
  while (existing.includes(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

// ── sub-components ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-b border-[var(--border)] bg-transparent px-0.5 pb-1.5 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)] ${mono ? "font-mono" : ""}`}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border-b border-[var(--border)] bg-transparent px-0.5 pb-1.5 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--text-secondary)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 rounded-full transition-colors ${checked ? "bg-[var(--accent-blue)]" : "bg-[var(--bg-active)]"}`}
      >
        <span className={`absolute top-[3px] left-[3px] h-3 w-3 rounded-full bg-white transition-transform ${checked ? "translate-x-3.5" : ""}`} />
      </button>
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
    </label>
  );
}

function EnvEditor({ entries, onChange }: { entries: [string, string][]; onChange: (v: [string, string][]) => void }) {
  return (
    <Field label="Environment variables">
      <div className="flex flex-col gap-2">
        {entries.map(([k, v], i) => (
          <div key={i} className="flex items-end gap-2">
            <input
              type="text"
              value={k}
              onChange={(e) => {
                const next = [...entries] as [string, string][];
                next[i] = [e.target.value, v];
                onChange(next);
              }}
              placeholder="KEY"
              className="w-1/3 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const next = [...entries] as [string, string][];
                next[i] = [k, e.target.value];
                onChange(next);
              }}
              placeholder="value"
              className="flex-1 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
            <button
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
              className="shrink-0 pb-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-red)]"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...entries, ["", ""]])}
          className="self-start text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          + Add variable
        </button>
      </div>
    </Field>
  );
}

function CardHeader({
  label,
  subtitle,
  expanded,
  onToggle,
  onDelete,
}: {
  label: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2">
      <button onClick={onToggle} className="flex flex-1 items-center gap-2 min-w-0 text-left">
        <span className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-secondary)]">
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{label || "untitled"}</span>
        {subtitle && !expanded && (
          <span className="truncate text-[12px] text-[var(--text-muted)] font-mono">{subtitle}</span>
        )}
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-[var(--accent-red)]"
        title="Remove"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// ── main component ──

interface VisualConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
}

export function VisualConfigEditor({ projectName, onSaved }: VisualConfigEditorProps) {
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const yaml = await ReadConfig(projectName);
      setOriginal(yaml);
      setForm(parseYaml(yaml));
      setError(null);
    } catch (err) {
      setError(`Failed to load: ${err}`);
    }
  }, [projectName]);

  useEffect(() => { load(); }, [load]);

  const currentYaml = form ? serializeToYaml(form) : "";
  const dirty = currentYaml !== "" && currentYaml !== serializeToYaml(parseYaml(original));

  const handleSave = useCallback(async () => {
    if (!form || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const yaml = serializeToYaml(form);
      const newName = await SaveConfig(projectName, yaml);
      setOriginal(yaml);
      onSaved(newName);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }, [form, dirty, projectName, onSaved]);

  useKeyboardShortcut({ key: "s", meta: true }, () => { if (dirty) handleSave(); });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── updaters ──

  const updateService = (i: number, patch: Partial<ServiceEntry>) =>
    setForm((f) => f && { ...f, services: f.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const updateAction = (i: number, patch: Partial<ActionEntry>) =>
    setForm((f) => f && { ...f, actions: f.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const updateTerminal = (i: number, patch: Partial<TerminalEntry>) =>
    setForm((f) => f && { ...f, terminals: f.terminals.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const updateProfile = (i: number, patch: Partial<ProfileEntry>) =>
    setForm((f) => f && { ...f, profiles: f.profiles.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const deleteItem = (section: keyof ConfigForm, i: number) =>
    setForm((f) => f && { ...f, [section]: (f[section] as unknown[]).filter((_, j) => j !== i) });

  const handleAddNew = (type: NewItemType) => {
    if (!form) return;
    const id = `new-${Date.now()}`;
    setExpanded((prev) => new Set(prev).add(id));

    if (type === "service") {
      const key = uniqueKey("new-service", form.services.map((s) => s.key));
      setForm({ ...form, services: [...form.services, { key, cmd: "", cwd: "", port: "", env: [] }] });
    } else if (type === "action") {
      const key = uniqueKey("new-action", form.actions.map((a) => a.key));
      setForm({ ...form, actions: [...form.actions, { key, cmd: "", label: "", cwd: "", env: [], confirm: false, display: "", type: "" }] });
    } else if (type === "terminal") {
      const key = uniqueKey("new-terminal", form.terminals.map((t) => t.key));
      setForm({ ...form, terminals: [...form.terminals, { key, cmd: "", label: "", cwd: "", env: [], display: "" }] });
    } else if (type === "profile") {
      const key = uniqueKey("new-profile", form.profiles.map((p) => p.key));
      setForm({ ...form, profiles: [...form.profiles, { key, services: [] }] });
    }
  };

  if (!form) {
    return (
      <div className="flex flex-1 items-center justify-center">
        {error ? (
          <span className="text-xs text-[var(--accent-red)]">{error}</span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">Loading...</span>
        )}
      </div>
    );
  }

  const serviceKeys = form.services.map((s) => s.key);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
      {/* Project basics */}
      <div className="grid grid-cols-2 gap-6">
        <Field label="Project name">
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="my-project" />
        </Field>
        <Field label="Root directory">
          <Input value={form.root} onChange={(v) => setForm({ ...form, root: v })} placeholder="~/Projects/my-app" mono />
        </Field>
      </div>

      {/* Services */}
      {form.services.length > 0 && (
        <Section title="Services" count={form.services.length}>
          {form.services.map((svc, i) => {
            const id = `svc-${svc.key}-${i}`;
            const isExpanded = expanded.has(id);
            return (
              <Card key={id}>
                <CardHeader
                  label={svc.key}
                  subtitle={svc.cmd}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("services", i)}
                />
                {isExpanded && (
                  <div className="mt-4 flex flex-col gap-4 pl-6">
                    <Field label="Name (key)">
                      <Input value={svc.key} onChange={(v) => updateService(i, { key: v })} placeholder="frontend" />
                    </Field>
                    <Field label="Command">
                      <Input value={svc.cmd} onChange={(v) => updateService(i, { cmd: v })} placeholder="npm run dev" mono />
                    </Field>
                    <div className="grid grid-cols-2 gap-6">
                      <Field label="Port">
                        <Input value={svc.port} onChange={(v) => updateService(i, { port: v })} placeholder="3000" />
                      </Field>
                      <Field label="Working directory">
                        <Input value={svc.cwd} onChange={(v) => updateService(i, { cwd: v })} placeholder="./frontend" mono />
                      </Field>
                    </div>
                    <EnvEditor entries={svc.env} onChange={(v) => updateService(i, { env: v })} />
                  </div>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {/* Actions */}
      {form.actions.length > 0 && (
        <Section title="Actions" count={form.actions.length}>
          {form.actions.map((act, i) => {
            const id = `act-${act.key}-${i}`;
            const isExpanded = expanded.has(id);
            return (
              <Card key={id}>
                <CardHeader
                  label={act.key}
                  subtitle={act.cmd}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("actions", i)}
                />
                {isExpanded && (
                  <div className="mt-4 flex flex-col gap-4 pl-6">
                    <Field label="Name (key)">
                      <Input value={act.key} onChange={(v) => updateAction(i, { key: v })} placeholder="deploy" />
                    </Field>
                    <Field label="Command">
                      <Input value={act.cmd} onChange={(v) => updateAction(i, { cmd: v })} placeholder="./deploy.sh" mono />
                    </Field>
                    <div className="grid grid-cols-2 gap-6">
                      <Field label="Label">
                        <Input value={act.label} onChange={(v) => updateAction(i, { label: v })} placeholder="Deploy" />
                      </Field>
                      <Field label="Working directory">
                        <Input value={act.cwd} onChange={(v) => updateAction(i, { cwd: v })} placeholder="./backend" mono />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <Field label="Display">
                        <Select
                          value={act.display}
                          onChange={(v) => updateAction(i, { display: v })}
                          options={[{ value: "", label: "Menu" }, { value: "button", label: "Header button" }]}
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={act.type}
                          onChange={(v) => updateAction(i, { type: v })}
                          options={[{ value: "", label: "Modal" }, { value: "terminal", label: "Terminal tab" }]}
                        />
                      </Field>
                    </div>
                    <Toggle checked={act.confirm} onChange={(v) => updateAction(i, { confirm: v })} label="Require confirmation" />
                    <EnvEditor entries={act.env} onChange={(v) => updateAction(i, { env: v })} />
                  </div>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {/* Terminals */}
      {form.terminals.length > 0 && (
        <Section title="Terminals" count={form.terminals.length}>
          {form.terminals.map((term, i) => {
            const id = `term-${term.key}-${i}`;
            const isExpanded = expanded.has(id);
            return (
              <Card key={id}>
                <CardHeader
                  label={term.key}
                  subtitle={term.cmd}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("terminals", i)}
                />
                {isExpanded && (
                  <div className="mt-4 flex flex-col gap-4 pl-6">
                    <Field label="Name (key)">
                      <Input value={term.key} onChange={(v) => updateTerminal(i, { key: v })} placeholder="logs" />
                    </Field>
                    <Field label="Command">
                      <Input value={term.cmd} onChange={(v) => updateTerminal(i, { cmd: v })} placeholder="tail -f logs/app.log" mono />
                    </Field>
                    <div className="grid grid-cols-2 gap-6">
                      <Field label="Label">
                        <Input value={term.label} onChange={(v) => updateTerminal(i, { label: v })} placeholder="App Logs" />
                      </Field>
                      <Field label="Working directory">
                        <Input value={term.cwd} onChange={(v) => updateTerminal(i, { cwd: v })} placeholder="./backend" mono />
                      </Field>
                    </div>
                    <Field label="Display">
                      <Select
                        value={term.display}
                        onChange={(v) => updateTerminal(i, { display: v })}
                        options={[{ value: "", label: "Menu" }, { value: "button", label: "Header button" }]}
                      />
                    </Field>
                    <EnvEditor entries={term.env} onChange={(v) => updateTerminal(i, { env: v })} />
                  </div>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {/* Profiles */}
      {form.profiles.length > 0 && (
        <Section title="Profiles" count={form.profiles.length}>
          {form.profiles.map((prof, i) => {
            const id = `prof-${prof.key}-${i}`;
            const isExpanded = expanded.has(id);
            return (
              <Card key={id}>
                <CardHeader
                  label={prof.key}
                  subtitle={prof.services.length > 0 ? prof.services.join(", ") : undefined}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("profiles", i)}
                />
                {isExpanded && (
                  <div className="mt-4 flex flex-col gap-4 pl-6">
                    <Field label="Name (key)">
                      <Input value={prof.key} onChange={(v) => updateProfile(i, { key: v })} placeholder="backend-only" />
                    </Field>
                    <Field label="Services">
                      {serviceKeys.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {serviceKeys.map((svcKey) => (
                            <label key={svcKey} className="flex items-center gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prof.services.includes(svcKey)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...prof.services, svcKey]
                                    : prof.services.filter((s) => s !== svcKey);
                                  updateProfile(i, { services: next });
                                }}
                                className="accent-[var(--accent-blue)]"
                              />
                              <span className="text-[13px] text-[var(--text-primary)]">{svcKey}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[var(--text-muted)]">Add services first</span>
                      )}
                    </Field>
                  </div>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {/* Add New + Save */}
      <div className="mt-6 flex items-center justify-between pb-4">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon />
          Add new
        </button>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-[var(--accent-red)]">{error}</span>}
          {dirty && (
            <>
              <span className="text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      <AddNewPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handleAddNew} />
    </div>
  );
}

// ── layout helpers ──

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{count}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--bg-secondary)] px-3.5 py-3">
      {children}
    </div>
  );
}
