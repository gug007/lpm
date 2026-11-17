import { useState } from "react";
import { toast } from "../../notifications/toast";
import { useAppStore } from "../../store/app";
import { SettingsSection } from "../SettingsSection";
import { LayoutTemplate, Plus } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyState } from "../ui/EmptyState";
import { BTN_PRIMARY, BTN_SECONDARY } from "../ui/buttons";
import { TemplateExample } from "./TemplateExample";
import { NewTemplateModal } from "./NewTemplateModal";
import { useSettingsTarget } from "./settingsTarget";
import { TemplateRow } from "./TemplateRow";
import { useMachineTemplates } from "./useMachineTemplates";

// Runs a template change, saying when it fails; rethrows so a dialog can stay
// open for another try.
async function attempt(what: string, change: () => Promise<void>): Promise<void> {
  try {
    await change();
  } catch (err) {
    toast.error(`Failed to ${what} template: ${err}`);
    throw err;
  }
}

export function TemplatesPane() {
  const { templates: commands } = useSettingsTarget().commands;
  const templates = useMachineTemplates(commands);
  const selectTemplate = useAppStore((s) => s.selectTemplate);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [creatingTemplateBusy, setCreatingTemplateBusy] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<string | null>(null);

  const startNew = () => {
    setNewTemplateName("");
    setCreatingTemplate(true);
  };

  return (
    <>
      {templates.length === 0 ? (
        <div data-settings-row="templates.list" className="mt-4">
          <EmptyState
            icon={<LayoutTemplate size={18} strokeWidth={1.8} />}
            title="No templates yet"
            body="A template holds the actions and terminals several projects share, like one for all your Rails apps."
          >
            <TemplateExample />
            <button onClick={startNew} className={`mt-5 ${BTN_PRIMARY}`}>
              New template…
            </button>
          </EmptyState>
        </div>
      ) : (
        <SettingsSection
          id="templates.list"
          title="Your templates"
          description="Reusable sets of actions and terminals you can apply to multiple projects. Handy when several projects share a common setup — for example, one template for all your Rails apps."
          actions={
            <button onClick={startNew} className={`flex items-center gap-1.5 ${BTN_SECONDARY}`}>
              <Plus size={13} />
              New template…
            </button>
          }
        >
          {templates.map((name) => (
            <TemplateRow
              key={name}
              name={name}
              onEditConfig={() => selectTemplate(name)}
              onRename={(oldName, newName) =>
                oldName === newName ? Promise.resolve() : attempt("rename", () => commands.rename(oldName, newName))
              }
              onDelete={() => setConfirmDeleteTemplate(name)}
            />
          ))}
        </SettingsSection>
      )}

      <ConfirmDialog
        open={confirmDeleteTemplate !== null}
        title="Delete template"
        variant="destructive"
        confirmLabel="Delete"
        body={
          <>
            Delete{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {confirmDeleteTemplate}
            </span>
            ? Configs that <code>extends</code> this template will fail to load until the reference is removed.
          </>
        }
        onCancel={() => setConfirmDeleteTemplate(null)}
        onConfirm={() => {
          if (confirmDeleteTemplate) void attempt("delete", () => commands.remove(confirmDeleteTemplate)).catch(() => {});
          setConfirmDeleteTemplate(null);
        }}
      />

      <NewTemplateModal
        open={creatingTemplate}
        value={newTemplateName}
        busy={creatingTemplateBusy}
        onChange={setNewTemplateName}
        onCancel={() => setCreatingTemplate(false)}
        onSubmit={async () => {
          const name = newTemplateName.trim();
          if (!name || creatingTemplateBusy) return;
          setCreatingTemplateBusy(true);
          try {
            await attempt("create", () => commands.create(name));
            setCreatingTemplate(false);
            selectTemplate(name);
          } catch {
            // the modal stays open for another try
          } finally {
            setCreatingTemplateBusy(false);
          }
        }}
      />
    </>
  );
}
