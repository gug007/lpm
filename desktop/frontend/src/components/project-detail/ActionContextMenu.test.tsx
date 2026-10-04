import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ZoneDisplay, ZoneInfo } from "../../types";
import { PanelBottomIcon, PanelTopIcon } from "../icons";
import { ActionContextMenu } from "./ActionContextMenu";

type Props = Parameters<typeof ActionContextMenu>[0];
type Found = ReactElement<{ label?: ReactNode; icon?: ReactNode; onClick?: () => void; children?: ReactNode }>;

// ActionContextMenu holds no state, so calling it returns its element tree.
// The result is every labelled row in document order, submenu rows included.
function rows(props: Props): Found[] {
  const found: Found[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement<Found["props"]>(node)) {
      if (node.props.label !== undefined) found.push(node);
      walk(node.props.children);
    }
  };
  walk(ActionContextMenu(props));
  return found;
}

const props = (extra: Partial<Props> = {}): Props => ({
  x: 10,
  y: 20,
  currentGroup: "zone:build",
  canMoveLeft: false,
  canMoveRight: false,
  onMoveTo: vi.fn(),
  onMoveLeft: vi.fn(),
  onMoveRight: vi.fn(),
  onZoneMenu: vi.fn(),
  onEdit: vi.fn(),
  canUngroup: false,
  onUngroup: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
  ...extra,
});

const MOVE_ROWS = ["Move", "To header", "To footer", "Left", "Right"];

const zone = (label: string, display?: ZoneDisplay): ZoneInfo => ({ name: "build", label, rows: 1, source: "project", display });

function zoneEntryIcon(zoneRow: ZoneDisplay) {
  const entry = rows(props({ zone: zone("Build", zoneRow) })).find(
    (row) => row.props.label === "Zone “Build”…",
  );
  const icon = entry?.props.icon;
  return isValidElement(icon) ? icon.type : undefined;
}

describe("ActionContextMenu zone entry", () => {
  it("follows Move for a button inside a zone", () => {
    const labels = rows(props({ zone: zone("Build") })).map((row) => row.props.label);
    expect(labels).toEqual(["Edit action", ...MOVE_ROWS, "Zone “Build”…", "Delete action"]);
  });

  it("quotes the name of a zone that has no label of its own", () => {
    const labels = rows(props({ zone: zone("zone-2") })).map((row) => row.props.label);
    expect(labels).toContain("Zone “zone-2”…");
  });

  it("opens the zone's menu and closes this one", () => {
    const onZoneMenu = vi.fn();
    const onClose = vi.fn();
    const entry = rows(props({ zone: zone("Build"), onZoneMenu, onClose })).find(
      (row) => row.props.label === "Zone “Build”…",
    );
    entry?.props.onClick?.();
    expect(onZoneMenu).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the top panel for a zone in the header", () => {
    expect(zoneEntryIcon("header")).toBe(PanelTopIcon);
  });

  it("shows the bottom panel for a zone in the footer", () => {
    expect(zoneEntryIcon("footer")).toBe(PanelBottomIcon);
  });

  it("is absent for a button outside zones", () => {
    const labels = rows(props({ currentGroup: "header" })).map((row) => row.props.label);
    expect(labels).toEqual(["Edit action", ...MOVE_ROWS, "Delete action"]);
  });
});

const TARGETS = [
  { group: "zone:tasks/checks" as const, label: "Tasks › Checks", row: "header" as const },
  { group: "zone:db" as const, label: "Database", row: "footer" as const },
];

const withZones = (extra: Partial<Props> = {}) =>
  props({ currentGroup: "header", zoneTargets: TARGETS, actionLabel: "Test", onNewZone: vi.fn(), ...extra });

const rowNamed = (all: Found[], label: string) => all.find((row) => row.props.label === label);

describe("ActionContextMenu zone moves", () => {
  it("offers a new zone and the zones the button can join, under Move", () => {
    const labels = rows(withZones()).map((row) => row.props.label);
    expect(labels).toEqual([
      "Edit action",
      ...MOVE_ROWS,
      "New zone with “Test”",
      "Into “Tasks › Checks”",
      "Into “Database”",
      "Delete action",
    ]);
  });

  it("starts a zone with the button and closes the menu", () => {
    const onNewZone = vi.fn();
    const onClose = vi.fn();
    rowNamed(rows(withZones({ onNewZone, onClose })), "New zone with “Test”")?.props.onClick?.();
    expect(onNewZone).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves the button into the chosen zone", () => {
    const onMoveTo = vi.fn();
    rowNamed(rows(withZones({ onMoveTo })), "Into “Database”")?.props.onClick?.();
    expect(onMoveTo).toHaveBeenCalledWith("zone:db");
  });

  it("marks each zone with its row's panel", () => {
    const all = rows(withZones());
    const iconOf = (label: string) => {
      const icon = rowNamed(all, label)?.props.icon;
      return isValidElement(icon) ? icon.type : undefined;
    };
    expect(iconOf("Into “Tasks › Checks”")).toBe(PanelTopIcon);
    expect(iconOf("Into “Database”")).toBe(PanelBottomIcon);
  });

  it("lists the zones without a new-zone row when the button can't start one", () => {
    const labels = rows(withZones({ onNewZone: undefined })).map((row) => row.props.label);
    expect(labels).not.toContain("New zone with “Test”");
    expect(labels).toContain("Into “Database”");
  });
});
