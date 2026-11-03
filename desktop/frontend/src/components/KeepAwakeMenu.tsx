import { createPortal } from "react-dom";
import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import { KeepAwakePanel } from "./KeepAwakePanel";
import { ContextMenuShell } from "./ui/ContextMenuShell";

type Place = { x: number; y: number; anchor?: undefined } | { anchor: HTMLElement; x?: undefined; y?: undefined };

// Keep a machine awake while agents work, for a set time, or until turned off.
export function KeepAwakeMenu({
  session,
  title,
  machine,
  place,
  align,
  trigger,
  onClose,
}: {
  session: KeepAwakeSession;
  title: string;
  /** How the notes name the machine: "this Mac", or a connected one's name. */
  machine: string;
  place: Place;
  align?: "start" | "end";
  trigger?: HTMLElement;
  onClose: () => void;
}) {
  return createPortal(
    <ContextMenuShell {...place} align={align} trigger={trigger} minWidth={300} onClose={onClose}>
      <KeepAwakePanel session={session} title={title} machine={machine} />
    </ContextMenuShell>,
    document.body,
  );
}
