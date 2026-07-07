# lpm mobile

An iOS companion app that pairs with lpm on your Mac and gives you a live,
co-interactive mirror of your terminals plus project start/stop and agent status
— the detached-window experience, in your pocket. All commands still run on your
Mac; the phone is a display/input client.

This directory is a **reviewable scaffold**, not a buildable app yet. The Rust
side (the server the phone talks to) is complete and shipping in the desktop app;
see `desktop/frontend/src-tauri/src/remote.rs` and `PROTOCOL.md`.

## What's here

```
mobile/
├── PROTOCOL.md                  # the wire contract (matches remote.rs exactly)
├── Package.swift                # SwiftTerm dependency pin (reference)
└── Sources/LpmMobile/
    ├── LpmProtocol.swift        # Codable-ish wire types + framing
    ├── LpmClient.swift          # URLSessionWebSocketTask client: connect/auth/reconnect
    ├── Keychain.swift           # SecItem-backed device token storage
    ├── QRScannerView.swift      # AVFoundation QR scanner + lpm://pair parser
    ├── AppModel.swift           # ObservableObject app state
    ├── Views.swift              # Pairing, Projects, Terminal (SwiftTerm) views
    └── LpmMobileApp.swift       # @main entry point
```

## Why it doesn't compile in this repo

The code targets **iOS 17+** and uses UIKit / iOS-only SwiftUI (UIDevice,
UIViewRepresentable, the two-parameter `onChange`, `textInputAutocapitalization`,
SwiftTerm). This repo's SourceKit indexes against the macOS SDK, so it reports
false "No such module 'UIKit'", "Cannot find type AppModel", and "@main …
top-level code" errors. Those clear the moment the files live in an Xcode iOS App
target with an iOS build destination.

## Build & run

### Fast path (one command)

`project.yml` is an [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec that
builds the whole target — sources, SwiftTerm dependency, and Info.plist keys —
so you don't click through Xcode:

```sh
brew install xcodegen        # once
cd mobile
xcodegen generate
open LpmMobile.xcodeproj
```

Then in Xcode: Signing & Capabilities → pick your team (automatic signing), select
a **physical iPhone** as the destination (not the Simulator — it can't reach your
Mac's LAN/tailnet), and ⌘R. The generated `LpmMobile.xcodeproj` and `Info.plist`
are gitignored; regenerate them any time from `project.yml`.

### Manual path (no XcodeGen)

1. **Create the app target.** File → New → Project → iOS App ("LpmMobile",
   SwiftUI, min deployment iOS 17). Delete the generated
   `ContentView.swift`/`App.swift` and add every file under `Sources/LpmMobile/`.
2. **Add SwiftTerm.** File → Add Package Dependencies →
   `https://github.com/migueldeicaza/SwiftTerm` (1.2.0+). This activates the
   `#if canImport(SwiftTerm)` terminal renderer.
3. **Info.plist keys.** `NSCameraUsageDescription` is **required** — without it
   the QR scanner crashes the app the moment it opens:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Scan the pairing QR code shown by lpm on your Mac.</string>
   <key>NSLocalNetworkUsageDescription</key>
   <string>Connect to lpm running on your Mac.</string>
   <key>NSBonjourServices</key>
   <array>
     <string>_lpm._tcp</string>
   </array>
   ```

### Pair

On your Mac: lpm → Settings → Mobile devices → enable the server, turn on **LAN**
exposure (else it only binds loopback and the phone can't reach it) → Add device.
On the iPhone: tap "Scan QR code" and scan, or enter host/port (default 8765) +
code manually. Sanity check the server from another machine: `nc -vz <mac-ip> 8765`.

## Roadmap (matches the plan)

- **v1 (this scaffold + shipped server):** pair over LAN/Tailscale, list projects
  with live status, start/stop projects & services, view + type into existing
  terminals via SwiftTerm with a Ctrl/Esc/Tab/arrows key row, reconnect+re-seed
  on foreground. **Done:** QR-scan pairing (`QRScannerView`) and real Keychain
  token storage (`Keychain.swift`).
- **Before shipping:** validate SwiftTerm against Claude Code's TUI (mouse
  reporting + OSC 52 copy → `UIPasteboard`), and build the Ctrl/Esc/Tab/arrows
  keyboard accessory row.
- **v2:** APNs push for "agent is Waiting" (needs a small vendor relay — the Mac
  can't wake a suspended iPhone), Live Activities for running agents, native TLS
  on the server (rcgen + rustls, already in the dependency graph), and mDNS
  auto-discovery.
