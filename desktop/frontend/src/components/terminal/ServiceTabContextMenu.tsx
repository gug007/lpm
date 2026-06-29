import { GlobeIcon, StopIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { BrowserOpenURL } from "../../../bridge/runtime";

interface ServiceTabContextMenuProps {
  x: number;
  y: number;
  // Live ports the service is listening on; empty until it binds (or always,
  // for remote projects) — drives whether "Open in browser" is actionable.
  ports: number[];
  onStop: () => void;
  onClose: () => void;
}

const portLabel = (port: number) => (
  <span className="font-mono text-[10px] tabular-nums">{`:${port}`}</span>
);

export function ServiceTabContextMenu({ x, y, ports, onStop, onClose }: ServiceTabContextMenuProps) {
  const open = (port: number) => {
    BrowserOpenURL(`http://localhost:${port}`);
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      {ports.length > 1 ? (
        <ContextMenuSubmenu label="Open in browser" icon={<GlobeIcon />}>
          {ports.map((port) => (
            <ContextMenuItem
              key={port}
              label={`localhost:${port}`}
              onClick={() => open(port)}
            />
          ))}
        </ContextMenuSubmenu>
      ) : (
        <ContextMenuItem
          label="Open in browser"
          icon={<GlobeIcon />}
          trailing={ports.length === 1 ? portLabel(ports[0]) : undefined}
          disabled={ports.length === 0}
          title={ports.length === 0 ? "No port detected yet" : undefined}
          onClick={() => open(ports[0])}
        />
      )}
      <ContextMenuItem
        label="Stop service"
        icon={<StopIcon />}
        destructive
        onClick={() => {
          onStop();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
