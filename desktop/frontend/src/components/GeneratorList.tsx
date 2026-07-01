import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Generator } from "../types";
import { useGeneratorsStore, useResolvedGenerators } from "../store/generators";
import { DEFAULT_GENERATORS } from "../generators";
import { GeneratorRow } from "./GeneratorRow";
import { GeneratorIconView } from "./generatorIcons";
import { GeneratorContextMenu } from "./GeneratorContextMenu";
import { GeneratorFormModal } from "./GeneratorFormModal";
import { GeneratorRunModal } from "./GeneratorRunModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";

type Menu = { generator: Generator; x: number; y: number };

export function GeneratorList() {
  const generators = useResolvedGenerators();
  const reorder = useGeneratorsStore((s) => s.reorder);
  const hideDefault = useGeneratorsStore((s) => s.hideDefault);
  const deleteCustom = useGeneratorsStore((s) => s.deleteCustom);
  const restoreDefault = useGeneratorsStore((s) => s.restoreDefault);
  const hiddenDefaults = useGeneratorsStore((s) => s.config.hiddenDefaults);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Generator | null>(null);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<Generator | null>(null);
  const [removing, setRemoving] = useState<Generator | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) reorder(String(active.id), String(over.id));
  };

  const confirmRemove = async () => {
    if (!removing) return;
    if (removing.builtin) await hideDefault(removing.id);
    else await deleteCustom(removing.id);
    setRemoving(null);
  };

  const restorable = DEFAULT_GENERATORS.filter((g) => hiddenDefaults.includes(g.id));

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={generators.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {generators.map((g) => (
              <GeneratorRow
                key={g.id}
                generator={g}
                onRun={(x) => setRunning(x)}
                onEdit={(x) => setEditing(x)}
                onRemove={(x) => setRemoving(x)}
                onContextMenu={(gen, x, y) => setMenu({ generator: gen, x, y })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={() => setCreating(true)}
        className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">＋</span>
        <span>Add custom…</span>
      </button>

      {restorable.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-[var(--border)]" />
          <div className="px-4 pb-0.5 pt-0.5 text-[11px] text-[var(--text-muted)]">Hidden</div>
          {restorable.map((g) => (
            <div key={g.id} className="flex items-center gap-2.5 px-4 py-1.5 text-[13px]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-60">
                <GeneratorIconView icon={g.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{g.label}</span>
              <button
                onClick={() => restoreDefault(g.id)}
                className="shrink-0 text-[11px] text-[var(--accent-blue)] hover:underline"
              >Restore</button>
            </div>
          ))}
        </>
      )}

      {menu && (
        <GeneratorContextMenu
          generator={menu.generator}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={(g) => { setMenu(null); setEditing(g); }}
          onRemove={(g) => { setMenu(null); setRemoving(g); }}
        />
      )}
      {creating && <GeneratorFormModal mode="create" onClose={() => setCreating(false)} />}
      {editing && <GeneratorFormModal mode="edit" generator={editing} onClose={() => setEditing(null)} />}
      {running && <GeneratorRunModal generator={running} onClose={() => setRunning(null)} />}

      <ConfirmDialog
        open={removing !== null}
        title={removing?.builtin ? "Hide generator" : "Delete generator"}
        body={
          removing?.builtin
            ? `Hide "${removing?.label}"? You can bring it back from the Hidden list.`
            : `Delete "${removing?.label}"? This can't be undone.`
        }
        confirmLabel={removing?.builtin ? "Hide" : "Delete"}
        variant={removing?.builtin ? "default" : "destructive"}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </>
  );
}
