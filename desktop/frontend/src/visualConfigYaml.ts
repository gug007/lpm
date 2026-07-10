import YAML from "yaml";

export interface ServiceEntry {
  key: string;
  cmd: string;
  cwd: string;
  port: string;
  env: [string, string][];
}

export interface ActionInputEntry {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  default: string;
  persist: boolean;
}

export interface ActionEntry {
  key: string;
  cmd: string;
  label: string;
  cwd: string;
  env: [string, string][];
  confirm: boolean;
  display: string;
  type: string;
  inputs: ActionInputEntry[];
}

export interface TerminalEntry {
  key: string;
  cmd: string;
  label: string;
  cwd: string;
  env: [string, string][];
  display: string;
}

export interface ProfileEntry {
  key: string;
  services: string[];
}

export interface ConfigForm {
  name: string;
  root: string;
  parentName: string;
  claudeAccount: string | null;
  services: ServiceEntry[];
  actions: ActionEntry[];
  terminals: TerminalEntry[];
  profiles: ProfileEntry[];
}

function parseEntry(key: string, v: unknown): { key: string; cmd: string; cwd: string; env: [string, string][] } {
  const isStr = typeof v === "string";
  const obj = isStr ? {} : (v as Record<string, unknown>);
  return {
    key,
    cmd: isStr ? (v as string) : String(obj.cmd || ""),
    cwd: String(obj.cwd || ""),
    env: Object.entries((obj.env as Record<string, string>) || {}),
  };
}

export function parseYaml(yaml: string): ConfigForm {
  const raw = YAML.parse(yaml) || {};
  return {
    name: raw.name || "",
    root: raw.root || "",
    parentName: typeof raw.parent_name === "string" ? raw.parent_name : "",
    claudeAccount: typeof raw.claudeAccount === "string" ? raw.claudeAccount : null,
    services: Object.entries((raw.services as Record<string, unknown>) || {}).map(([key, v]) => {
      const base = parseEntry(key, v);
      const obj = typeof v === "string" ? {} : (v as Record<string, unknown>);
      return { ...base, port: obj.port ? String(obj.port) : "" };
    }),
    actions: Object.entries((raw.actions as Record<string, unknown>) || {}).map(([key, v]) => {
      const base = parseEntry(key, v);
      const obj = typeof v === "string" ? {} : (v as Record<string, unknown>);
      const rawInputs = (obj.inputs as Record<string, unknown>) || {};
      return {
        ...base,
        label: String(obj.label || ""),
        confirm: Boolean(obj.confirm),
        display: String(obj.display || ""),
        type: String(obj.type || ""),
        inputs: Object.entries(rawInputs).map(([k, inp]) => {
          const o = (inp as Record<string, unknown>) || {};
          return {
            key: k,
            label: String(o.label || ""),
            type: String(o.type || "text"),
            required: Boolean(o.required),
            placeholder: String(o.placeholder || ""),
            default: String(o.default || ""),
            persist: Boolean(o.persist),
          };
        }),
      };
    }),
    terminals: Object.entries((raw.terminals as Record<string, unknown>) || {}).map(([key, v]) => {
      const base = parseEntry(key, v);
      const obj = typeof v === "string" ? {} : (v as Record<string, unknown>);
      return { ...base, label: String(obj.label || ""), display: String(obj.display || "") };
    }),
    profiles: Object.entries((raw.profiles as Record<string, string[]>) || {}).map(([key, v]) => ({
      key,
      services: Array.isArray(v) ? v : [],
    })),
  };
}

function serializeEntry(entry: { cmd: string; cwd: string; env: [string, string][] }, extras: Record<string, unknown>): string | Record<string, unknown> {
  const hasExtras = entry.cwd || entry.env.length > 0 || Object.values(extras).some(Boolean);
  if (!hasExtras) return entry.cmd;
  const obj: Record<string, unknown> = { cmd: entry.cmd };
  if (entry.cwd) obj.cwd = entry.cwd;
  if (entry.env.length > 0) obj.env = Object.fromEntries(entry.env.filter(([k]) => k));
  return { ...obj, ...Object.fromEntries(Object.entries(extras).filter(([, v]) => v)) };
}

export function serializeToYaml(form: ConfigForm, originalContent: string): string {
  let doc: Record<string, unknown>;
  try {
    const parsed = YAML.parse(originalContent);
    doc = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    doc = {};
  }

  if (form.name) doc.name = form.name;
  else delete doc.name;

  if (form.root) doc.root = form.root;
  else delete doc.root;

  const parentPresent = typeof doc.parent_name === "string" && doc.parent_name !== "";
  if (form.claudeAccount === null) {
    delete doc.claudeAccount;
  } else if (form.claudeAccount === "") {
    if (parentPresent) doc.claudeAccount = "";
    else delete doc.claudeAccount;
  } else {
    doc.claudeAccount = form.claudeAccount;
  }

  const svcs: Record<string, unknown> = {};
  for (const s of form.services) {
    if (!s.key) continue;
    svcs[s.key] = serializeEntry(s, { port: s.port ? (parseInt(s.port, 10) || 0) : 0 });
  }
  if (Object.keys(svcs).length > 0) doc.services = svcs;
  else delete doc.services;

  const acts: Record<string, unknown> = {};
  for (const a of form.actions) {
    if (!a.key) continue;
    let inputsObj: Record<string, unknown> | undefined;
    if (a.inputs.length > 0) {
      inputsObj = {};
      for (const inp of a.inputs) {
        if (!inp.key) continue;
        const o: Record<string, unknown> = {};
        if (inp.label) o.label = inp.label;
        if (inp.type && inp.type !== "text") o.type = inp.type;
        if (inp.required) o.required = true;
        if (inp.placeholder) o.placeholder = inp.placeholder;
        if (inp.default) o.default = inp.default;
        if (inp.persist) o.persist = true;
        inputsObj[inp.key] = o;
      }
    }
    acts[a.key] = serializeEntry(a, { label: a.label, confirm: a.confirm || undefined, display: a.display, type: a.type, inputs: inputsObj });
  }
  if (Object.keys(acts).length > 0) doc.actions = acts;
  else delete doc.actions;

  const terms: Record<string, unknown> = {};
  for (const t of form.terminals) {
    if (!t.key) continue;
    terms[t.key] = serializeEntry(t, { label: t.label, display: t.display });
  }
  if (Object.keys(terms).length > 0) doc.terminals = terms;
  else delete doc.terminals;

  const profs: Record<string, string[]> = {};
  for (const p of form.profiles) {
    if (!p.key) continue;
    profs[p.key] = p.services.filter(Boolean);
  }
  if (Object.keys(profs).length > 0) doc.profiles = profs;
  else delete doc.profiles;

  return YAML.stringify(doc, { lineWidth: 0 });
}
