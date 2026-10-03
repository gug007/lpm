# Zones and layers

Read this reference to create, fill, rearrange, or remove button zones and their layers.

- [What a zone is](#what-a-zone-is)
- [Fields](#fields)
- [Pick the file](#pick-the-file)
- [Working with zones](#working-with-zones)
- [Pitfalls](#pitfalls)

## What a zone is

A zone is a framed spot in the desktop header or footer that holds buttons as buttons, not as menu items. It is 1, 2 or 3 rows of its bar tall, keeps that height when empty, and fills top to bottom, then the next column. A zone can hold layers: separate sets of buttons it slides between, switched with dots under the frame.

A zone holds placement only. A button keeps its definition wherever it is declared; `display: <zone>` puts it in the zone and `layer: <key>` picks the layer.

## Fields

```yaml
zones:
  build:
    rows: 2            # 1, 2 or 3; an entry with rows declares the zone
    label: Build       # optional; shown in menus, defaults to the key
    display: header    # header (default) or footer
    position: 3        # optional; order among the items of its bar
    layers:            # optional
      mobile:
        label: Mobile  # optional; shown left of the dots, otherwise dots only
        position: 1
      web:
        position: 2
actions:
  ios:
    cmd: make ios
    display: build     # the zone's key
    layer: mobile      # the layer's key; without it, the first layer
    position: 1        # order inside the zone (or layer)
```

- A zone entry holds only `rows`, `label`, `display`, `position` and `layers`. A layer entry holds only `label` and `position`.
- Zone and layer keys can't be empty and can't contain `:` or `/`. Zone keys can't be `header`, `footer`, `menu` or `button`.
- A zone's `position` shares one numbering with the buttons of its bar: header zones with header buttons, footer zones with footer buttons. Items with a `position` come first, lowest first; the rest follow by key.
- A button's `position` inside a zone counts from 1 within that zone (or layer).
- The first layer is the one with the lowest `position`. Positioned layers come before unpositioned ones, and ties go by key.
- A button without `layer`, or naming a layer the zone doesn't have, shows in the first layer. A button whose `display` names a zone that doesn't exist shows in the header.
- Dots appear only when a zone has 2 or more layers. A zone without `layers` is one implicit layer.

## Pick the file

Zones live in the project file, the repo `.lpm.yml`, or `global.yml`, and merge like actions: project file > duplicate's parent > repo `.lpm.yml` (local projects only) > `global.yml`, field by field. Templates can't hold zones.

- An entry with `rows` declares the zone. The topmost file whose entry has `rows` is the zone's source; edit height, layers, and removal there.
- An entry without `rows` is a note that adjusts a zone declared in another file, such as a `position` or `display` in the project file.
- Layers merge per layer key, field by field, in the same file order.
- A duplicate's own file can't hold zones. `lpm config get/apply --layer project --project <duplicate>` reads and writes its parent's file, so the change reaches every copy.

Choose the layer from the user's intent:

| Intent | Layer |
|---|---|
| Just me, this project | `--layer project` |
| The team, checked in | `--layer repo` (`<root>/.lpm.yml`) |
| Every project | `--layer global` (`~/.lpm/global.yml`) |

## Working with zones

Run every change through `lpm config get` and `lpm config apply` as `validation.md` describes. Read the zone's other files first (`--layer repo`, `--layer global`) to find where the zone and its buttons are declared.

### Create a zone

Add an entry with `rows` to the chosen file. Give it a `position` among the bar's items, or leave it off to sort by key after positioned items.

```yaml
zones:
  release:
    rows: 1
    display: footer
    position: 2
```

### Put a button in a zone

Set `display` to the zone's key and `position` to its place inside the zone. If the button is declared in this file, edit it in place:

```yaml
actions:
  ios:
    cmd: make ios
    display: build
    position: 1
```

If the button is declared in another file (repo, global, or a template) and the change is only for this file's scope, write a sparse override with just the placement fields instead of copying the definition. `lpm config apply` warns that the entry has no command; that is expected for an override.

```yaml
actions:
  ios:
    display: build
    position: 1
```

### Add layers

A zone without `layers` already holds its buttons in one implicit layer. To make it layered, write that first layer as an entry plus the new ones, in the zone's source file. Buttons without `layer` stay in the first layer, so they need no change.

```yaml
zones:
  build:
    rows: 2
    layers:
      layer-1:
        position: 1
      layer-2:
        label: Release
        position: 2
```

When the zone already has layers, give a new layer a `position` above the highest one so the first layer doesn't change. If the existing layers have no positions, first give each one a position in the order they show (by key), then add the new one after them.

### Move a button to a layer

Set `layer` to the layer's key next to `display`, and `position` to its place inside the layer. Use a sparse override for a button declared in another file.

```yaml
actions:
  ios:
    display: build
    layer: layer-2
    position: 1
```

To move a button into the first layer, name the first layer's key. An empty `layer` doesn't override a `layer` set in a lower file.

### Rename or reorder layers

Change a layer's `label` to rename it and its `position` to reorder it. Keep the keys: buttons point at layer keys, and a button naming a missing key falls back to the first layer. Reordering can change which layer is first, and buttons without `layer` follow the first layer; give them an explicit `layer` beforehand if they should stay where they are.

```yaml
zones:
  build:
    rows: 2
    layers:
      layer-1:
        label: Mobile
        position: 2
      layer-2:
        label: Release
        position: 1
```

### Remove a layer

1. Point every button in the layer at a neighbouring layer by rewriting its `layer` (the app uses the layer before it, or the next one when removing the first). Search every file that sets `layer: <key>` for this zone.
2. Delete the layer entry from the zone's source file. When one layer remains, you may delete `layers` altogether.

Buttons left pointing at a removed layer fall into the first layer, which may not be the neighbour.

### Remove a zone

1. Move its buttons out: set `display: header` (or `footer`) and drop `layer`. Write `display` explicitly; an empty or missing `display` keeps a lower file's zone.
2. Delete the zone entry from its source file, and delete leftover notes without `rows` in other files.

A zone declared in `.lpm.yml` or `global.yml` is shared: removing it moves every project's buttons for that zone to the header. Confirm with the user before removing a shared zone.

## Pitfalls

- Zone and layer keys can't contain `:` or `/`; zone keys can't be `header`, `footer`, `menu`, `button`, or empty.
- `rows` must be 1, 2 or 3, and only an entry with `rows` creates a zone. A note alone shows nothing.
- `display` naming a missing zone is not an error: the button shows in the header. The validator checks one file at a time and can't see zones declared in the other files.
- Labels are optional for zones and layers. A layer without a label shows dots only.
- Sparse overrides can't clear a lower file's value: an empty `display` or `layer` inherits it. Write the value you want.
- Only top-level actions sit in a zone; nested child actions stay menu items.
