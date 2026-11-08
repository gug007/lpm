import { ExternalLink } from "lucide-react";
import { CopyIcon, GlobeIcon } from "../icons";
import { ContextMenuItem, type ContextMenuAuxAction } from "../ui/ContextMenuItem";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { copyProjectPortUrl, openProjectPort } from "../../peer/projectPorts";
import { BROWSER_IN_APP, openPortInLpm, portTabLabel } from "../../portLinks";
import { protocolForPort } from "../../portProtocols";

export interface PortLink {
  port: number;
  service?: string;
}

interface PortLinkMenuItemsProps {
  projectName: string;
  links: PortLink[];
  // Where a Browser tab opens: the pane the menu was opened from.
  paneId?: string;
  // With no links, a disabled row saying why; without it, nothing.
  emptyHint?: string;
  onClose: () => void;
}

const portLabel = (port: number) => (
  <span className="font-mono text-[10px] tabular-nums">{`:${port}`}</span>
);

// A project's web servers in a menu: each opens in lpm's Browser tab, with the
// default browser as a button at the row's end, and each address can be copied.
export function PortLinkMenuItems({ projectName, links, paneId, emptyHint, onClose }: PortLinkMenuItemsProps) {
  const openLabel = BROWSER_IN_APP ? "Open in lpm" : "Open in browser";
  const done = (run: () => void) => () => {
    run();
    onClose();
  };
  const openHere = (link: PortLink) =>
    done(() => openPortInLpm(projectName, link.port, { label: portTabLabel(link.port, link.service), paneId }));
  const copy = (link: PortLink) =>
    done(() => void copyProjectPortUrl(projectName, link.port, protocolForPort(link.port)?.scheme));
  const webLinks = links.filter((link) => !protocolForPort(link.port));
  const outside = (link: PortLink): ContextMenuAuxAction | undefined =>
    BROWSER_IN_APP
      ? {
          label: "Open in default browser",
          icon: <ExternalLink size={12} />,
          onClick: done(() => void openProjectPort(projectName, link.port)),
        }
      : undefined;
  const nameOf = (link: PortLink) => link.service ?? `localhost:${link.port}`;

  if (links.length === 0) {
    if (!emptyHint) return null;
    return <ContextMenuItem label={openLabel} icon={<GlobeIcon />} disabled title={emptyHint} onClick={() => {}} />;
  }
  if (links.length === 1) {
    const [link] = links;
    return (
      <>
        {webLinks.length > 0 && (
          <ContextMenuItem
            label={openLabel}
            icon={<GlobeIcon />}
            trailing={portLabel(link.port)}
            trailingAction={outside(link)}
            onClick={openHere(link)}
          />
        )}
        <ContextMenuItem label="Copy URL" icon={<CopyIcon />} onClick={copy(link)} />
      </>
    );
  }
  return (
    <>
      {webLinks.length > 0 && (
        <ContextMenuSubmenu label={openLabel} icon={<GlobeIcon />}>
          {webLinks.map((link) => (
            <ContextMenuItem
              key={`${link.service ?? ""}:${link.port}`}
              label={nameOf(link)}
              trailing={portLabel(link.port)}
              trailingAction={outside(link)}
              onClick={openHere(link)}
            />
          ))}
        </ContextMenuSubmenu>
      )}
      <ContextMenuSubmenu label="Copy URL" icon={<CopyIcon />}>
        {links.map((link) => (
          <ContextMenuItem
            key={`${link.service ?? ""}:${link.port}`}
            label={nameOf(link)}
            trailing={portLabel(link.port)}
            onClick={copy(link)}
          />
        ))}
      </ContextMenuSubmenu>
    </>
  );
}
