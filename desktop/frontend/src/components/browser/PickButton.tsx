import { MousePointerClickIcon } from "../icons";
import { usePickInBrowser } from "./usePickInBrowser";

interface PickButtonProps {
  id: string;
  projectName: string;
  shown: boolean;
  disabled: boolean;
  className: string;
}

/** The browser toolbar's Pick: click an element (or Shift-drag an area) on the
 *  page and it lands in the project agent's input with a picture of it. */
export function PickButton({ id, projectName, shown, disabled, className }: PickButtonProps) {
  const { picking, toggle } = usePickInBrowser(id, projectName, shown);
  const on = picking
    ? "bg-[var(--accent-cyan)]/15 !text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20"
    : "";
  return (
    <button
      className={`${className} ${on} disabled:pointer-events-none disabled:opacity-40`}
      onClick={() => void toggle()}
      disabled={disabled}
      aria-pressed={picking}
      title={
        picking
          ? "Picking: click an element on the page, or Shift-drag an area. Esc stops"
          : "Pick an element to send to the agent"
      }
      aria-label={picking ? "Stop picking" : "Pick an element to send to the agent"}
    >
      <MousePointerClickIcon />
    </button>
  );
}
