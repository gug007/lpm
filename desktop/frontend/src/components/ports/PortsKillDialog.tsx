import { ConfirmDialog } from "../ui/ConfirmDialog";
import { isOutside, type ListeningPort } from "./portsModel";

interface PortsKillDialogProps {
  port: ListeningPort | null;
  onCancel: () => void;
  onConfirm: (port: ListeningPort) => void;
}

export function PortsKillDialog({ port, onCancel, onConfirm }: PortsKillDialogProps) {
  const name = port?.process || "the process";
  const where = port && !isOutside(port) ? ` in ${port.projectLabel || port.project}'s terminal` : "";
  return (
    <ConfirmDialog
      open={!!port}
      title={port ? `End ${name} on :${port.port}?` : undefined}
      body={
        port && (
          <>
            {name} (PID {port.pid}){where} holds this port. Ending it frees the port, and anything
            it hasn't saved is lost.
          </>
        )
      }
      confirmLabel="Kill"
      variant="destructive"
      onCancel={onCancel}
      onConfirm={() => port && onConfirm(port)}
    />
  );
}
