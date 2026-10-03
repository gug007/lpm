import { useId, useState, type FormEvent } from "react";
import type { ZoneDisplay, ZoneRows } from "../../types";
import type { ZoneDetails } from "../../zoneConfig";
import type { LayerDraft } from "../../zoneLayerConfig";
import { Modal } from "../ui/Modal";
import { SegmentedControl } from "../ui/SegmentedControl";
import { FIELD_CLASS, HELPER_TEXT } from "../ui/fields";
import { ZONE_ROW_CHOICES, zoneRowsLabel } from "../zoneGeometry";
import { type LayerRow, ZoneLayersEditor } from "./ZoneLayersEditor";

interface ZoneDialogProps {
  mode: "create" | "edit";
  // The bar the zone sits in, or will.
  row: ZoneDisplay;
  // Shown in an empty Name field: what the zone is called without a name.
  placeholder: string;
  // `layers` only when editing: a new zone starts without any.
  initial: ZoneDetails & { layers?: LayerDraft[] };
  onCancel: () => void;
  onSubmit: (details: ZoneDetails, layers: LayerDraft[]) => void;
}

const ROW_OPTIONS = ZONE_ROW_CHOICES.map((rows) => ({ value: `${rows}` as `${ZoneRows}`, label: zoneRowsLabel(rows) }));

const rowsOf = (drafts: LayerDraft[]): LayerRow[] =>
  drafts.map((draft, i) => ({ ...draft, id: draft.key ? `key:${draft.key}` : `draft:${i}` }));

const draftsOfRows = (rows: LayerRow[]): LayerDraft[] =>
  rows.map(({ key, label }) => (key ? { key, label: label.trim() } : { label: label.trim() }));

// Mounted only while open, so every opening starts from `initial`.
export function ZoneDialog({ mode, row, placeholder, initial, onCancel, onSubmit }: ZoneDialogProps) {
  const [label, setLabel] = useState(initial.label);
  const [rows, setRows] = useState<ZoneRows>(initial.rows);
  const [layers, setLayers] = useState(() => rowsOf(initial.layers ?? []));
  // Escape cancels a keyboard drag; it must not also close the dialog.
  const [dragging, setDragging] = useState(false);
  const nameId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ label: label.trim(), rows }, draftsOfRows(layers));
  };
  return (
    <Modal
      open
      onClose={onCancel}
      closeOnEscape={!dragging}
      contentClassName="w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <form onSubmit={submit} noValidate>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          {mode === "create" ? "Create zone" : "Edit zone"}
        </h3>
        <p className={`mt-1.5 ${HELPER_TEXT}`}>
          {mode === "create"
            ? `A framed group of buttons at the end of the ${row} row.`
            : `A framed group of buttons in the ${row} row.`}
        </p>
        <label htmlFor={nameId} className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]">
          Name
        </label>
        <input
          id={nameId}
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`mt-1.5 px-3 py-2 ${FIELD_CLASS}`}
        />
        <p className={`mt-1 ${HELPER_TEXT}`}>Shown in menus, not on the zone.</p>
        <span className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]">Height</span>
        <SegmentedControl
          className="mt-1.5"
          fullWidth
          ariaLabel="Zone height"
          value={`${rows}` as `${ZoneRows}`}
          options={ROW_OPTIONS}
          onChange={(value) => setRows(Number(value) as ZoneRows)}
        />
        {mode === "edit" && (
          <>
            <span className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]">Layers</span>
            <ZoneLayersEditor rows={layers} onChange={setLayers} onDraggingChange={setDragging} />
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
