export const ZONES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
zones:
  mobile:
    rows: 2                   # 1, 2 or 3 rows of the bar tall
    label: Mobile             # shown in menus; defaults to the key
    display: header           # header (default) or footer
actions:
  ios:
    cmd: make ios
    label: iOS
    display: mobile           # the zone's key puts the button inside
    position: 1               # order inside the zone
  android:
    cmd: make android
    label: Android
    display: mobile
    position: 2
  testflight:
    cmd: make testflight
    label: TestFlight
    display: mobile
    position: 3
`;

export const ZONES_LAYERS_EXAMPLE = `zones:
  build:
    rows: 2
    layers:                   # button sets, switched with the dots
      mobile:
        label: Mobile         # shown left of the dots
        position: 1
      release:
        label: Release
        position: 2
actions:
  ios:
    cmd: make ios
    label: iOS
    display: build
    layer: mobile
  android:
    cmd: make android
    label: Android
    display: build
    layer: mobile
  testflight:
    cmd: make testflight
    label: TestFlight
    display: build
    layer: mobile
  tag:
    cmd: ./scripts/tag-release.sh
    label: Tag release
    display: build
    layer: release
    confirm: true
`;
