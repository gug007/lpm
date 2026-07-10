import { useState, useMemo } from "react";
import { AddNewPicker, type NewItemType } from "./AddNewPicker";
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, ZapIcon, PlayIcon, TerminalIcon, LayersIcon } from "./icons";
import { uniqueKey } from "../uniqueKey";
import { useAccountsStore } from "../store/accounts";
import {
  parseYaml,
  serializeToYaml,
  type ConfigForm,
  type ServiceEntry,
  type ActionEntry,
  type ActionInputEntry,
  type TerminalEntry,
  type ProfileEntry,
} from "../visualConfigYaml";

const INHERIT_OPTION = "__inherit__";

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

function DisplaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select
      value={value === "button" ? "" : value}
      onChange={onChange}
      options={[
        { value: "", label: "Header (default)" },
        { value: "footer", label: "Footer" },
        ...(value === "menu" ? [{ value: "menu", label: "Menu (legacy)" }] : []),
      ]}
    />
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

function InputsEditor({ entries, onChange }: { entries: ActionInputEntry[]; onChange: (v: ActionInputEntry[]) => void }) {
  return (
    <Field label="Input prompts">
      <div className="flex flex-col gap-3">
        {entries.map((inp, i) => (
          <div key={i} className="flex flex-col gap-2 border-l border-[var(--border)] pl-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inp.key}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...inp, key: e.target.value };
                  onChange(next);
                }}
                placeholder="key"
                className="w-1/3 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
              <input
                type="text"
                value={inp.label}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...inp, label: e.target.value };
                  onChange(next);
                }}
                placeholder="Label"
                className="flex-1 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
              <button
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                className="shrink-0 pb-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-red)]"
              >
                <TrashIcon />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={inp.type}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...inp, type: e.target.value };
                  onChange(next);
                }}
                className="w-1/4 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
              >
                <option value="text">text</option>
                <option value="password">password</option>
              </select>
              <input
                type="text"
                value={inp.placeholder}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...inp, placeholder: e.target.value };
                  onChange(next);
                }}
                placeholder="Placeholder"
                className="flex-1 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
              <input
                type="text"
                value={inp.default}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...inp, default: e.target.value };
                  onChange(next);
                }}
                placeholder="Default"
                className="flex-1 border-b border-[var(--border)] bg-transparent px-0.5 pb-1 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inp.required}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...inp, required: e.target.checked };
                    onChange(next);
                  }}
                  className="accent-[var(--accent-blue)]"
                />
                <span className="text-[11px] text-[var(--text-muted)]">Req</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inp.persist}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...inp, persist: e.target.checked };
                    onChange(next);
                  }}
                  className="accent-[var(--accent-blue)]"
                />
                <span className="text-[11px] text-[var(--text-muted)]">Persist</span>
              </label>
            </div>
          </div>
        ))}
        <button
          onClick={() => onChange([...entries, { key: "", label: "", type: "text", required: false, placeholder: "", default: "", persist: false }])}
          className="self-start text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          + Add input
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
    <div className="group flex items-center gap-3">
      <button onClick={onToggle} className="flex flex-1 items-center gap-3 min-w-0 text-left">
        <span className="shrink-0 text-[var(--text-muted)] opacity-50 transition-opacity group-hover:opacity-100">
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className="shrink-0 truncate text-[13px] text-[var(--text-primary)]">{label || "untitled"}</span>
        {subtitle && !expanded && (
          <span className="flex-1 min-w-0 truncate text-right text-[12px] font-mono text-[var(--text-muted)]">{subtitle}</span>
        )}
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 p-1 text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-[var(--accent-red)]"
        title="Remove"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

interface VisualConfigEditorProps {
  content: string;
  onChange: (yaml: string) => void;
  isRemote?: boolean;
}

export function VisualConfigEditor({ content, onChange, isRemote = false }: VisualConfigEditorProps) {
  const form = useMemo(() => parseYaml(content), [content]);
  const accounts = useAccountsStore((s) => s.accounts);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const update = (patch: Partial<ConfigForm>) => onChange(serializeToYaml({ ...form, ...patch }, content));

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateService = (i: number, patch: Partial<ServiceEntry>) =>
    update({ services: form.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const updateAction = (i: number, patch: Partial<ActionEntry>) =>
    update({ actions: form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const updateTerminal = (i: number, patch: Partial<TerminalEntry>) =>
    update({ terminals: form.terminals.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const updateProfile = (i: number, patch: Partial<ProfileEntry>) =>
    update({ profiles: form.profiles.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const deleteItem = (section: "services" | "actions" | "terminals" | "profiles", i: number) =>
    update({ [section]: (form[section] as unknown[]).filter((_, j) => j !== i) });

  const handleAddNew = (type: NewItemType) => {
    const nextId = form.services.length + form.actions.length + form.terminals.length + form.profiles.length;
    setExpanded((prev) => new Set(prev).add(nextId));

    if (type === "service") {
      const key = uniqueKey("new-service", form.services.map((s) => s.key));
      update({ services: [...form.services, { key, cmd: "", cwd: "", port: "", env: [] }] });
    } else if (type === "action") {
      const key = uniqueKey("new-action", form.actions.map((a) => a.key));
      update({ actions: [...form.actions, { key, cmd: "", label: "", cwd: "", env: [], confirm: false, display: "", type: "", inputs: [] }] });
    } else if (type === "terminal") {
      const key = uniqueKey("new-terminal", form.terminals.map((t) => t.key));
      update({ terminals: [...form.terminals, { key, cmd: "", label: "", cwd: "", env: [], display: "" }] });
    } else if (type === "profile") {
      const key = uniqueKey("new-profile", form.profiles.map((p) => p.key));
      update({ profiles: [...form.profiles, { key, services: [] }] });
    }
  };

  const serviceKeys = form.services.map((s) => s.key);
  // Running index counter for stable card IDs across sections
  let cardIdx = 0;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
      <div className="grid grid-cols-2 gap-6">
        <Field label="Project name">
          <Input value={form.name} onChange={(v) => update({ name: v })} placeholder="my-project" />
        </Field>
        <Field label="Root directory">
          <Input value={form.root} onChange={(v) => update({ root: v })} placeholder="~/Projects/my-app" mono />
        </Field>
        {!isRemote && (accounts.length > 0 || form.claudeAccount) && (
          <Field label="Claude account">
            <Select
              value={form.claudeAccount === null ? (form.parentName ? INHERIT_OPTION : "") : form.claudeAccount}
              onChange={(v) => update({ claudeAccount: v === INHERIT_OPTION ? null : v })}
              options={[
                ...(form.parentName ? [{ value: INHERIT_OPTION, label: "Inherit from parent" }] : []),
                { value: "", label: "Default" },
                ...accounts.map((a) => ({ value: a.id, label: a.label })),
                ...(form.claudeAccount && !accounts.some((a) => a.id === form.claudeAccount)
                  ? [{ value: form.claudeAccount, label: "Removed account" }]
                  : []),
              ]}
            />
          </Field>
        )}
      </div>

      {form.services.length > 0 && (
        <Section title="Services" count={form.services.length} icon={<span style={{ color: "#facc15" }}><ZapIcon /></span>}>
          {form.services.map((svc, i) => {
            const id = cardIdx++;
            return (
              <Card key={id}>
                <CardHeader
                  label={svc.key}
                  subtitle={svc.cmd}
                  expanded={expanded.has(id)}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("services", i)}
                />
                {expanded.has(id) && (
                  <div className="mt-4 mb-2 flex flex-col gap-4 pl-[26px]">
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

      {form.actions.length > 0 && (
        <Section title="Actions" count={form.actions.length} icon={<span style={{ color: "#10b981" }}><PlayIcon /></span>}>
          {form.actions.map((act, i) => {
            const id = cardIdx++;
            return (
              <Card key={id}>
                <CardHeader
                  label={act.key}
                  subtitle={act.cmd}
                  expanded={expanded.has(id)}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("actions", i)}
                />
                {expanded.has(id) && (
                  <div className="mt-4 mb-2 flex flex-col gap-4 pl-[26px]">
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
                        <DisplaySelect
                          value={act.display}
                          onChange={(v) => updateAction(i, { display: v })}
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={act.type}
                          onChange={(v) => updateAction(i, { type: v })}
                          options={[{ value: "", label: "Modal" }, { value: "terminal", label: "Terminal tab" }, { value: "command", label: "Active terminal" }, { value: "background", label: "Background" }]}
                        />
                      </Field>
                    </div>
                    <Toggle checked={act.confirm} onChange={(v) => updateAction(i, { confirm: v })} label="Require confirmation" />
                    <EnvEditor entries={act.env} onChange={(v) => updateAction(i, { env: v })} />
                    <InputsEditor
                      entries={act.inputs}
                      onChange={(v) => updateAction(i, { inputs: v })}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {form.terminals.length > 0 && (
        <Section title="Terminals" count={form.terminals.length} icon={<span style={{ color: "#22d3ee" }}><TerminalIcon /></span>}>
          {form.terminals.map((term, i) => {
            const id = cardIdx++;
            return (
              <Card key={id}>
                <CardHeader
                  label={term.key}
                  subtitle={term.cmd}
                  expanded={expanded.has(id)}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("terminals", i)}
                />
                {expanded.has(id) && (
                  <div className="mt-4 mb-2 flex flex-col gap-4 pl-[26px]">
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
                      <DisplaySelect
                        value={term.display}
                        onChange={(v) => updateTerminal(i, { display: v })}
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

      {form.profiles.length > 0 && (
        <Section title="Profiles" count={form.profiles.length} icon={<span style={{ color: "#a78bfa" }}><LayersIcon /></span>}>
          {form.profiles.map((prof, i) => {
            const id = cardIdx++;
            return (
              <Card key={id}>
                <CardHeader
                  label={prof.key}
                  subtitle={prof.services.length > 0 ? prof.services.join(", ") : undefined}
                  expanded={expanded.has(id)}
                  onToggle={() => toggleExpand(id)}
                  onDelete={() => deleteItem("profiles", i)}
                />
                {expanded.has(id) && (
                  <div className="mt-4 mb-2 flex flex-col gap-4 pl-[26px]">
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

      <div className="mt-6 pb-4">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon />
          Add new
        </button>
      </div>

      <AddNewPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handleAddNew} />
    </div>
  );
}

function Section({ title, count, icon, children }: { title: string; count: number; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center gap-2 border-b border-[var(--border)] pb-2">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{title}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
      </div>
      <div className="flex flex-col divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-3">
      {children}
    </div>
  );
}
