import { useEffect, useMemo, useState } from "react";
import { GlobeIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import { BrowserOpenURL } from "../../bridge/runtime";
import { DetectServicePorts } from "../../bridge/commands";
import { parseServicePorts } from "../servicePorts";

interface RunningService {
  name: string;
  port: number;
}

interface OpenInBrowserSubmenuProps {
  projectName: string;
  running: boolean;
  services: RunningService[];
  onClose: () => void;
}

interface ServiceLink {
  service: string;
  port: number;
}

const portLabel = (port: number) => (
  <span className="font-mono text-[10px] tabular-nums">{`:${port}`}</span>
);

// Opens localhost:<port> for each running service in the default browser. The
// configured `port:` renders the row synchronously so the menu has its final
// height on the first frame (no async reflow / flicker); live detection then
// refines each service to the port it actually bound.
export function OpenInBrowserSubmenu({ projectName, running, services, onClose }: OpenInBrowserSubmenuProps) {
  const [detected, setDetected] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!running) {
      setDetected({});
      return;
    }
    let cancelled = false;
    DetectServicePorts(projectName)
      .then((res) => {
        if (!cancelled) setDetected(parseServicePorts(res));
      })
      .catch(() => {
        // Detection is best-effort; the configured ports still drive the menu.
      });
    return () => {
      cancelled = true;
    };
  }, [projectName, running]);

  const links = useMemo<ServiceLink[]>(() => {
    const out: ServiceLink[] = [];
    for (const svc of services) {
      const found = detected[svc.name];
      const ports = found?.length ? found : svc.port > 0 ? [svc.port] : [];
      for (const port of ports) out.push({ service: svc.name, port });
    }
    return out;
  }, [services, detected]);

  if (!running || links.length === 0) return null;

  const open = (port: number) => {
    BrowserOpenURL(`http://localhost:${port}`);
    onClose();
  };

  if (links.length === 1) {
    const only = links[0];
    return (
      <ContextMenuItem
        label="Open in browser"
        icon={<GlobeIcon />}
        trailing={portLabel(only.port)}
        onClick={() => open(only.port)}
      />
    );
  }

  return (
    <ContextMenuSubmenu label="Open in browser" icon={<GlobeIcon />}>
      {links.map((link) => (
        <ContextMenuItem
          key={`${link.service}:${link.port}`}
          label={link.service}
          trailing={portLabel(link.port)}
          onClick={() => open(link.port)}
        />
      ))}
    </ContextMenuSubmenu>
  );
}
