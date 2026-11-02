import { useEffect, useState } from "react";
import { accountLabel } from "../claudePoolText";
import { useKnownClaudeAccountsOf } from "../hooks/useClaudeAccountsOf";
import { useAppStore } from "../store/app";
import { answerTabAccountQuestion, dismissTabAccountQuestion, useTabAccountQuestion } from "../store/claudeAccountPick";
import { useProjectClaudeTabs } from "../store/projectClaudeTabs";
import { useTerminalTitles } from "../store/terminalTitles";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { ConfirmDialog } from "./ui/ConfirmDialog";

/** Asked when one account is picked for a project whose Claude tabs run on
 *  another: every such tab, the selected one ticked, to move along with the
 *  pick, or none to keep the account for new sessions only. */
export function ClaudeTabAccountQuestion() {
  const question = useTabAccountQuestion((s) => s.question);
  const projectName = question?.projectName ?? null;
  const projects = useAppStore((s) => s.projects);
  const machine = useKnownClaudeAccountsOf(projectName);
  const titles = useTerminalTitles((s) => (projectName ? s.byProject[projectName] : undefined));
  const working = useProjectClaudeTabs((s) => (projectName ? s.byProject[projectName]?.working : undefined));
  const [ticked, setTicked] = useState<string[]>([]);

  useEffect(() => {
    const selected = question?.tabs.find((t) => t.id === question.selected && t.from !== question.account);
    setTicked(selected ? [selected.id] : []);
  }, [question]);

  if (!question) return null;

  const label = (id: string) => accountLabel(id, machine?.pool ?? null, machine?.accounts);
  const to = label(question.account);
  const project = displayNameForProjectName(question.projectName, projects);
  const isWorking = (id: string) => working?.includes(id) ?? false;
  const toggle = (id: string) =>
    setTicked((was) => (was.includes(id) ? was.filter((t) => t !== id) : [...was, id]));
  const moving = question.tabs.filter((t) => ticked.includes(t.id)).map((t) => t.id);
  const order = Object.keys(titles ?? {});
  const names = question.tabs.map((t) => titles?.[t.id] || "Claude");
  // New Claude tabs share a name until their conversation gets a title, so
  // repeats say where the tab sits in the strip.
  const nameOf = (i: number) =>
    names.filter((n) => n === names[i]).length > 1 && order.includes(question.tabs[i].id)
      ? `${names[i]} · tab ${order.indexOf(question.tabs[i].id) + 1}`
      : names[i];
  const count = moving.length;

  return (
    <ConfirmDialog
      open
      title={`Move open tabs to ${to}?`}
      widthClassName="w-[500px]"
      body={
        <>
          <p>
            New Claude sessions in {project} will start on {to}. Tick the tabs that should move too.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
            {question.tabs.map((t, i) => {
              const already = t.from === question.account;
              const selected = t.id === question.selected;
              return (
                <label
                  key={t.id}
                  className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? "border-t border-[var(--border)]" : ""} ${selected ? "bg-[var(--bg-secondary)]" : ""} ${already ? "text-[var(--text-muted)]" : "cursor-pointer text-[var(--text-primary)]"}`}
                >
                  <input
                    type="checkbox"
                    checked={already || ticked.includes(t.id)}
                    disabled={already}
                    onChange={() => toggle(t.id)}
                    className="accent-[var(--text-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{nameOf(i)}</span>
                  {selected && (
                    <span className="rounded bg-[var(--bg-active)] px-1.5 py-px text-[10px] text-[var(--text-primary)]">
                      Selected
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                    {already
                      ? `Already on ${to}`
                      : `${t.from ? label(t.from) : "Another account"} · ${isWorking(t.id) ? "working" : "idle"}`}
                  </span>
                </label>
              );
            })}
          </div>
          {moving.some(isWorking) && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              A tab where Claude is working has its turn interrupted, then picks up on {to}.
            </p>
          )}
        </>
      }
      secondaryLabel="New sessions only"
      onSecondary={() => void answerTabAccountQuestion([])}
      confirmLabel={count === 0 ? "Move tabs" : count === 1 ? "Move 1 tab" : `Move ${count} tabs`}
      confirmDisabled={count === 0}
      onConfirm={() => void answerTabAccountQuestion(moving)}
      onCancel={dismissTabAccountQuestion}
    />
  );
}
