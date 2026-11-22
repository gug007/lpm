import { EventsOn } from "../bridge/runtime";
import { applyInterfaceSize, interfaceSizeLabel, steppedInterfaceSize } from "./interfaceSize";
import { interfaceZoom } from "./interfaceZoom";
import { toast } from "./notifications/toast";
import { saveSettings } from "./store/settings";

/** View › Bigger (1), Smaller (-1) or Actual Size (0): the next interface size,
 *  saved, drawn, and said in a toast that each further step replaces. */
export async function stepInterfaceSize(step: number): Promise<void> {
  const next = steppedInterfaceSize(interfaceZoom(), step);
  await saveSettings({ interfaceSize: next });
  await applyInterfaceSize(next);
  toast(`Interface size ${interfaceSizeLabel(next)}`, { id: "interface-size" });
}

/** The macOS View menu's items, which the backend sends the main window. */
export function initInterfaceSizeMenu(): void {
  EventsOn("menu-interface-size", (step: unknown) => void stepInterfaceSize(Number(step) || 0));
}
