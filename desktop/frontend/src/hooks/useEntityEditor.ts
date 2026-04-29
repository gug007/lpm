import { useCallback, useState, type MouseEvent } from "react";
import { toast } from "sonner";

interface NamedEntity {
  name: string;
}

export interface EntityEditor<T extends NamedEntity> {
  formOpen: boolean;
  editing: T | null;
  contextMenu: { x: number; y: number; entity: T } | null;
  toDelete: T | null;
  deleting: boolean;
  startCreate: () => void;
  startEdit: (entity: T) => void;
  closeForm: () => void;
  showContextMenu: (e: MouseEvent, entity: T) => void;
  closeContextMenu: () => void;
  editFromContextMenu: () => void;
  deleteFromContextMenu: () => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

interface Options {
  projectName: string;
  entityLabel: "service" | "profile";
  deleteFn: (projectName: string, name: string) => Promise<unknown>;
  onChanged: () => void;
}

// useEntityEditor consolidates the modal/context-menu/delete-confirm state
// for a single named entity type (services or profiles). Both have the same
// shape of edit affordances, so this hook is shared by ProjectDetail.
export function useEntityEditor<T extends NamedEntity>({
  projectName,
  entityLabel,
  deleteFn,
  onChanged,
}: Options): EntityEditor<T> {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [contextMenu, setContextMenu] = useState<EntityEditor<T>["contextMenu"]>(null);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startCreate = useCallback(() => {
    setEditing(null);
    setCreating(true);
  }, []);

  const startEdit = useCallback((entity: T) => {
    setCreating(false);
    setEditing(entity);
  }, []);

  const closeForm = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);

  const showContextMenu = useCallback((e: MouseEvent, entity: T) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entity });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const editFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    setCreating(false);
    setEditing(contextMenu.entity);
  }, [contextMenu]);

  const deleteFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    setToDelete(contextMenu.entity);
  }, [contextMenu]);

  const cancelDelete = useCallback(() => setToDelete(null), []);

  const confirmDelete = useCallback(async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteFn(projectName, toDelete.name);
      toast.success(`Deleted ${toDelete.name}`);
      setToDelete(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not delete ${entityLabel}`);
    } finally {
      setDeleting(false);
    }
  }, [toDelete, projectName, deleteFn, entityLabel, onChanged]);

  return {
    formOpen: creating || editing !== null,
    editing,
    contextMenu,
    toDelete,
    deleting,
    startCreate,
    startEdit,
    closeForm,
    showContextMenu,
    closeContextMenu,
    editFromContextMenu,
    deleteFromContextMenu,
    cancelDelete,
    confirmDelete,
  };
}
