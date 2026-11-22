import { useRowLayoutDialog } from "../store/rowLayoutDialog";
import { RowLayoutDialogBody } from "./RowLayoutDialogBody";

/** The Row builder. It floats beside the sidebar without covering it, so the
 *  sidebar is its live preview: every change lands there at once. */
export function SidebarRowLayoutDialog() {
  const open = useRowLayoutDialog((s) => s.open);
  if (!open) return null;
  return <RowLayoutDialogBody />;
}
