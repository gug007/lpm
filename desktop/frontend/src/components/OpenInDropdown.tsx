import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, CheckIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { launchOpenInTarget, useOpenInTargets, OPEN_IN_SELECTED_KEY, type OpenInTarget } from "../hooks/useOpenInTargets";

const EDITOR_IDS = new Set([
  "cursor", "vscode", "vscode-insiders", "windsurf", "zed", "xcode", "sublime-text", "webstorm", "typora",
]);
const TERMINAL_IDS = new Set(["terminal", "iterm2", "ghostty", "warp"]);

function groupTargets(targets: OpenInTarget[]) {
  const editors: OpenInTarget[] = [];
  const terminals: OpenInTarget[] = [];
  const other: OpenInTarget[] = [];
  for (const t of targets) {
    (EDITOR_IDS.has(t.id) ? editors : TERMINAL_IDS.has(t.id) ? terminals : other).push(t);
  }
  return [
    { label: "Editors", items: editors },
    { label: "Terminals", items: terminals },
    { label: null, items: other },
  ].filter((g) => g.items.length > 0);
}

export function OpenInDropdown({ projectPath, isRemote = false }: {
  projectPath: string;
  isRemote?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const allTargets = useOpenInTargets();
  const targets = useMemo(
    () => allTargets.filter((t) => !t.fileOnly && (!isRemote || t.remoteCapable)),
    [allTargets, isRemote],
  );
  const groups = useMemo(() => groupTargets(targets), [targets]);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem(OPEN_IN_SELECTED_KEY) ?? "");
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = useMemo(() => {
    if (targets.length === 0) return null;
    return targets.find((t) => t.id === selectedId) ?? targets[0];
  }, [targets, selectedId]);

  if (targets.length === 0 || !selected) return null;

  const launch = (t: OpenInTarget) => launchOpenInTarget(t, projectPath);

  const pick = (t: OpenInTarget) => {
    setSelectedId(t.id);
    setOpen(false);
    launch(t); // also persists the selection (see launchOpenInTarget)
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="inline-flex h-8 items-stretch rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
        <button
          onClick={() => launch(selected)}
          title={`Open in ${selected.label}`}
          className="flex items-center rounded-l-lg px-2 text-[var(--text-secondary)] transition-all duration-100 hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)] active:scale-[0.97]"
        >
          <AppIcon target={selected} size={20} />
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Choose app"
          className={`flex items-center rounded-r-lg border-l border-[var(--border)] px-1.5 transition-all duration-100 hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)] active:scale-[0.97] ${
            open ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          }`}
        >
          <span className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
            <ChevronDownIcon />
          </span>
        </button>
      </div>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-52 origin-top-right rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-xl"
          style={{ animation: "switcher-in 140ms cubic-bezier(0.2, 0.9, 0.3, 1) both" }}
        >
          {groups.map((group, gi) => (
            <div key={group.label ?? "other"}>
              {group.label ? (
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {group.label}
                </div>
              ) : (
                gi > 0 && <div className="mx-2 my-1 h-px bg-[var(--border)]" />
              )}
              {group.items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-75 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                    t.id === selected.id ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  <AppIcon target={t} size={18} />
                  <span className="flex-1 truncate">{t.label}</span>
                  {t.id === selected.id && (
                    <span className="text-[var(--text-muted)]">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppIcon({ target, size }: { target: OpenInTarget; size: number }) {
  if (target.icon) {
    return <img src={target.icon} alt="" style={{ width: size, height: size }} className="shrink-0" />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[5px] bg-[var(--bg-active)] text-[9px] font-semibold text-[var(--text-secondary)]"
    >
      {target.label.charAt(0)}
    </span>
  );
}
