import { useState, useMemo } from "react";
import { Layers, Play, Plus, SquareTerminal, Zap } from "lucide-react";
import { AddNewPicker, type NewItemType } from "./AddNewPicker";
import { uniqueKey } from "../uniqueKey";
import {
  parseYaml,
  serializeToYaml,
  type ConfigForm,
  type ServiceEntry,
  type ActionEntry,
  type TerminalEntry,
  type ProfileEntry,
} from "../visualConfigYaml";
import { ClaudeAccountField } from "./config-form/ClaudeAccountField";
import { RootDirectoryField } from "./config-form/RootDirectoryField";
import { ConfigDisplaySelect } from "./config-form/ConfigDisplaySelect";
import { ConfigEnvEditor } from "./config-form/ConfigEnvEditor";
import { ConfigField } from "./config-form/ConfigField";
import { ConfigFormUnavailable } from "./config-form/ConfigFormUnavailable";
import { ConfigInput } from "./config-form/ConfigInput";
import { ConfigInputsEditor } from "./config-form/ConfigInputsEditor";
import { ConfigRow } from "./config-form/ConfigRow";
import { ConfigSection } from "./config-form/ConfigSection";
import { ConfigSelect } from "./config-form/ConfigSelect";
import { ConfigToggle } from "./config-form/ConfigToggle";
import { TEXT_ACTION } from "./ui/buttons";

interface VisualConfigEditorProps {
  content: string;
  onChange: (yaml: string) => void;
  onEditYaml: () => void;
  isRemote?: boolean;
}

type Section = "services" | "actions" | "terminals" | "profiles";

const SECTION_OF: Record<NewItemType, Section> = {
  service: "services",
  action: "actions",
  terminal: "terminals",
  profile: "profiles",
};

const rowId = (section: Section, index: number) => `${section}:${index}`;

export function VisualConfigEditor({ content, onChange, onEditYaml, isRemote = false }: VisualConfigEditorProps) {
  const parsed = useMemo(() => {
    try {
      return { form: parseYaml(content), error: "" };
    } catch (error) {
      return {
        form: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [content]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Open rows by section and position: a row added at its section's end
  // takes the next position, and no row elsewhere moves.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!parsed.form) return <ConfigFormUnavailable error={parsed.error} onEditYaml={onEditYaml} />;

  const form = parsed.form;
  const update = (patch: Partial<ConfigForm>) => onChange(serializeToYaml({ ...form, ...patch }, content));

  const toggleExpand = (id: string) => {
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

  const deleteItem = (section: Section, i: number) =>
    update({ [section]: (form[section] as unknown[]).filter((_, j) => j !== i) });

  const handleAddNew = (type: NewItemType) => {
    const section = SECTION_OF[type];
    setExpanded((prev) => new Set([...prev, rowId(section, form[section].length)]));

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
  const withAccount = !isRemote && !form.hasSsh;

  return (
    <div className="flex flex-col">
      <div className={`grid gap-4 ${withAccount ? "grid-cols-3" : "grid-cols-2"}`}>
        <ConfigField label="Project name">
          <ConfigInput value={form.name} onChange={(v) => update({ name: v })} placeholder="my-project" />
        </ConfigField>
        <RootDirectoryField value={form.root} onChange={(root) => update({ root })} browsable={withAccount} />
        {withAccount && <ClaudeAccountField form={form} onChange={update} />}
      </div>

      {form.services.length > 0 && (
        <ConfigSection title="Services" count={form.services.length} icon={Zap} addLabel="Add service" onAdd={() => handleAddNew("service")}>
          {form.services.map((svc, i) => {
            const id = rowId("services", i);
            return (
              <ConfigRow
                key={id}
                label={svc.key}
                subtitle={svc.cmd}
                expanded={expanded.has(id)}
                onToggle={() => toggleExpand(id)}
                onDelete={() => deleteItem("services", i)}
              >
                <ConfigField label="Name (key)">
                  <ConfigInput value={svc.key} onChange={(v) => updateService(i, { key: v })} placeholder="frontend" />
                </ConfigField>
                <ConfigField label="Command">
                  <ConfigInput value={svc.cmd} onChange={(v) => updateService(i, { cmd: v })} placeholder="npm run dev" mono />
                </ConfigField>
                <div className="grid grid-cols-2 gap-4">
                  <ConfigField label="Port">
                    <ConfigInput value={svc.port} onChange={(v) => updateService(i, { port: v })} placeholder="3000" />
                  </ConfigField>
                  <ConfigField label="Working directory">
                    <ConfigInput value={svc.cwd} onChange={(v) => updateService(i, { cwd: v })} placeholder="./frontend" />
                  </ConfigField>
                </div>
                <ConfigEnvEditor entries={svc.env} onChange={(v) => updateService(i, { env: v })} />
              </ConfigRow>
            );
          })}
        </ConfigSection>
      )}

      {form.actions.length > 0 && (
        <ConfigSection title="Actions" count={form.actions.length} icon={Play} addLabel="Add action" onAdd={() => handleAddNew("action")}>
          {form.actions.map((act, i) => {
            const id = rowId("actions", i);
            return (
              <ConfigRow
                key={id}
                label={act.key}
                subtitle={act.cmd}
                expanded={expanded.has(id)}
                onToggle={() => toggleExpand(id)}
                onDelete={() => deleteItem("actions", i)}
              >
                <ConfigField label="Name (key)">
                  <ConfigInput value={act.key} onChange={(v) => updateAction(i, { key: v })} placeholder="deploy" />
                </ConfigField>
                <ConfigField label="Command">
                  <ConfigInput value={act.cmd} onChange={(v) => updateAction(i, { cmd: v })} placeholder="./deploy.sh" mono />
                </ConfigField>
                <div className="grid grid-cols-2 gap-4">
                  <ConfigField label="Label">
                    <ConfigInput value={act.label} onChange={(v) => updateAction(i, { label: v })} placeholder="Deploy" />
                  </ConfigField>
                  <ConfigField label="Working directory">
                    <ConfigInput value={act.cwd} onChange={(v) => updateAction(i, { cwd: v })} placeholder="./backend" />
                  </ConfigField>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ConfigField label="Display">
                    <ConfigDisplaySelect value={act.display} onChange={(v) => updateAction(i, { display: v })} />
                  </ConfigField>
                  <ConfigField label="Type">
                    <ConfigSelect
                      value={act.type}
                      onChange={(v) => updateAction(i, { type: v })}
                      options={[
                        { value: "", label: "Modal" },
                        { value: "terminal", label: "Terminal tab" },
                        { value: "command", label: "Active terminal" },
                        { value: "background", label: "Background" },
                      ]}
                    />
                  </ConfigField>
                </div>
                <ConfigToggle checked={act.confirm} onChange={(v) => updateAction(i, { confirm: v })} label="Require confirmation" />
                <ConfigEnvEditor entries={act.env} onChange={(v) => updateAction(i, { env: v })} />
                <ConfigInputsEditor entries={act.inputs} onChange={(v) => updateAction(i, { inputs: v })} />
              </ConfigRow>
            );
          })}
        </ConfigSection>
      )}

      {form.terminals.length > 0 && (
        <ConfigSection
          title="Terminals"
          count={form.terminals.length}
          icon={SquareTerminal}
          addLabel="Add terminal"
          onAdd={() => handleAddNew("terminal")}
        >
          {form.terminals.map((term, i) => {
            const id = rowId("terminals", i);
            return (
              <ConfigRow
                key={id}
                label={term.key}
                subtitle={term.cmd}
                expanded={expanded.has(id)}
                onToggle={() => toggleExpand(id)}
                onDelete={() => deleteItem("terminals", i)}
              >
                <ConfigField label="Name (key)">
                  <ConfigInput value={term.key} onChange={(v) => updateTerminal(i, { key: v })} placeholder="logs" />
                </ConfigField>
                <ConfigField label="Command">
                  <ConfigInput value={term.cmd} onChange={(v) => updateTerminal(i, { cmd: v })} placeholder="tail -f logs/app.log" mono />
                </ConfigField>
                <div className="grid grid-cols-2 gap-4">
                  <ConfigField label="Label">
                    <ConfigInput value={term.label} onChange={(v) => updateTerminal(i, { label: v })} placeholder="App Logs" />
                  </ConfigField>
                  <ConfigField label="Working directory">
                    <ConfigInput value={term.cwd} onChange={(v) => updateTerminal(i, { cwd: v })} placeholder="./backend" />
                  </ConfigField>
                </div>
                <ConfigField label="Display">
                  <ConfigDisplaySelect value={term.display} onChange={(v) => updateTerminal(i, { display: v })} />
                </ConfigField>
                <ConfigEnvEditor entries={term.env} onChange={(v) => updateTerminal(i, { env: v })} />
              </ConfigRow>
            );
          })}
        </ConfigSection>
      )}

      {form.profiles.length > 0 && (
        <ConfigSection title="Profiles" count={form.profiles.length} icon={Layers} addLabel="Add profile" onAdd={() => handleAddNew("profile")}>
          {form.profiles.map((prof, i) => {
            const id = rowId("profiles", i);
            return (
              <ConfigRow
                key={id}
                label={prof.key}
                subtitle={prof.services.length > 0 ? prof.services.join(", ") : undefined}
                expanded={expanded.has(id)}
                onToggle={() => toggleExpand(id)}
                onDelete={() => deleteItem("profiles", i)}
              >
                <ConfigField label="Name (key)">
                  <ConfigInput value={prof.key} onChange={(v) => updateProfile(i, { key: v })} placeholder="backend-only" />
                </ConfigField>
                <ConfigField label="Services">
                  {serviceKeys.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {serviceKeys.map((svcKey) => (
                        <label key={svcKey} className="flex cursor-pointer items-center gap-2.5">
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
                </ConfigField>
              </ConfigRow>
            );
          })}
        </ConfigSection>
      )}

      <button type="button" onClick={() => setPickerOpen(true)} className={`-ml-1.5 mb-10 mt-6 self-start ${TEXT_ACTION}`}>
        <Plus size={13} strokeWidth={2} />
        Add service, action, terminal or profile
      </button>

      <AddNewPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handleAddNew} />
    </div>
  );
}
