import { PORT_LINK_HINT, openPortLink, portTabLabel } from "../../portLinks";
import { protocolForPort, protocolUrl } from "../../portProtocols";
import { Tooltip } from "../ui/Tooltip";

interface ServicePortLinksProps {
  projectName: string;
  ports: number[];
  // The service they belong to, which names the Browser tab a link opens.
  service?: string;
  // The pane the links sit in, where that tab opens.
  paneId?: string;
  // The port the config names, when the service listens elsewhere instead.
  configuredPort?: number;
  className?: string;
}

function linkHint(port: number): string {
  const protocol = protocolForPort(port);
  return protocol ? `Copy ${protocolUrl(protocol, port)}` : PORT_LINK_HINT;
}

export function ServicePortLinks({
  projectName,
  ports,
  service,
  paneId,
  configuredPort,
  className = "font-mono text-[10px]",
}: ServicePortLinksProps) {
  const moved = configuredPort !== undefined;
  return (
    <span className={`flex shrink-0 items-center gap-1 tabular-nums ${className}`}>
      {ports.map((port) => (
        <Tooltip
          key={port}
          content={
            moved ? `Listening on :${port}, not :${configuredPort} as the config says. ${linkHint(port)}` : linkHint(port)
          }
          side="bottom"
          wide={moved}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              openPortLink(projectName, port, e.altKey, { label: portTabLabel(port, service), paneId });
            }}
            className={`cursor-pointer underline-offset-2 transition-opacity hover:underline hover:opacity-100 ${
              moved
                ? "text-[var(--accent-amber-text)] opacity-90"
                : "opacity-60 hover:text-[var(--accent-sky-text)]"
            }`}
          >
            :{port}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
