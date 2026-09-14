import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveWorkStatuses, useWorkStatusesStore } from "../store/workStatuses";
import type { CustomWorkStatus, ProjectInfo } from "../types";
import {
  addCustomWorkStatus,
  customWorkStatusChoice,
  existingNoteFor,
  removeCustomWorkStatus,
  removeFromWorkStatusOrder,
  renameInWorkStatusOrder,
  retagWorkStatus,
  updateCustomWorkStatus,
  type WorkStatusChoice,
  type WorkStatusInput,
} from "../workStatus";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { RenameModal } from "./RenameModal";
import { WorkStatusEditModal, type WorkStatusEditor } from "./WorkStatusEditModal";
import { WorkStatusRemoveConfirm } from "./WorkStatusRemoveConfirm";

interface WorkStatusDialogsOptions {
  projects: ProjectInfo[];
  onSetWorkStatus: (name: string, input: WorkStatusInput | null) => void;
}

/** The dialogs a status can open — the line a status asks for when applied,
 *  one status's own form, and the confirm before one leaves — and the handlers
 *  a row's menu drives them by. `dialogs` renders them all; mount it once
 *  beside the sidebar's other modals. */
export function useWorkStatusDialogs({ projects, onSetWorkStatus }: WorkStatusDialogsOptions) {
  const palette = useWorkStatusesStore((s) => s.custom);
  const order = useWorkStatusesStore((s) => s.order);
  const [noteFor, setNoteFor] = useState<{ name: string; choice: WorkStatusChoice } | null>(null);
  const [editor, setEditor] = useState<WorkStatusEditor | null>(null);
  // The status the menu's × asked about, waiting on the confirm.
  const [removing, setRemoving] = useState<CustomWorkStatus | null>(null);

  const pick = (name: string, choice: WorkStatusChoice | null) => {
    if (choice?.asksNote) setNoteFor({ name, choice });
    else onSetWorkStatus(name, choice?.input ?? null);
  };

  const displayName = (name: string) => displayNameForProjectName(name, projects);
  // A patch without `order` leaves the stored order alone.
  const alsoOrder = (next: string[] | undefined) => (next ? { order: next } : {});
  const blocked = noteFor?.choice.input.state === "blocked";

  const remove = (label: string) => {
    saveWorkStatuses({
      custom: removeCustomWorkStatus(palette, label),
      ...alsoOrder(removeFromWorkStatusOrder(order, label)),
    });
    toast.success(`Removed ${label}. Projects wearing it keep it until you change them.`);
  };
  const reorder = (next: string[]) => saveWorkStatuses({ order: next });

  const submitEditor = (entry: CustomWorkStatus) => {
    if (!editor) return;
    if (editor.kind === "add") {
      saveWorkStatuses({ custom: addCustomWorkStatus(palette, entry) });
      pick(editor.applyTo, customWorkStatusChoice(entry));
      return;
    }
    const oldLabel = editor.entry.label;
    saveWorkStatuses({
      custom: updateCustomWorkStatus(palette, oldLabel, entry),
      ...alsoOrder(renameInWorkStatusOrder(order, oldLabel, entry.label)),
    });
    for (const { name, input } of retagWorkStatus(projects, oldLabel, entry)) {
      onSetWorkStatus(name, input);
    }
  };

  const dialogs: ReactNode = (
    <>
      <RenameModal
        open={noteFor !== null}
        title={noteFor?.choice.label ?? ""}
        description={
          noteFor
            ? blocked
              ? `What is blocking ${displayName(noteFor.name)}? It shows under the name in the sidebar.`
              : `A line about ${displayName(noteFor.name)}, shown under its name in the sidebar.`
            : undefined
        }
        initialValue={
          noteFor
            ? existingNoteFor(
                projects.find((p) => p.name === noteFor.name)?.workStatus,
                noteFor.choice.input,
              )
            : ""
        }
        placeholder={blocked ? "Waiting on…" : "What's going on…"}
        allowEmpty
        submitLabel={(value) => (value ? "Save" : `Mark ${noteFor?.choice.label ?? ""}`)}
        onClose={() => setNoteFor(null)}
        onSubmit={(note) => {
          if (noteFor) onSetWorkStatus(noteFor.name, { ...noteFor.choice.input, note });
        }}
      />
      <WorkStatusEditModal
        editor={
          editor?.kind === "add" ? { kind: "add", applyTo: displayName(editor.applyTo) } : editor
        }
        palette={palette}
        onSubmit={submitEditor}
        onClose={() => setEditor(null)}
      />
      <WorkStatusRemoveConfirm
        open={removing !== null}
        label={removing?.label ?? ""}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove(removing.label);
          setRemoving(null);
        }}
      />
    </>
  );

  return {
    pick,
    openAdd: (name: string) => setEditor({ kind: "add", applyTo: name }),
    openEdit: (entry: CustomWorkStatus) => setEditor({ kind: "edit", entry }),
    confirmRemove: (entry: CustomWorkStatus) => setRemoving(entry),
    reorder,
    dialogs,
  };
}
