import Foundation

/// Why the Mac said it was going away, so the phone can say "asleep" instead
/// of guessing at network problems. Saved per Mac until it connects again.
struct Farewell: Codable, Equatable {
    enum Reason: String, Codable { case sleep, quit, off }
    var reason: Reason
    var at: Date
}

/// What changed on the phone's side to set off the current reconnect.
enum ReconnectReason: Equatable { case leftWiFi, joinedWiFi, backOnline }

/// Where Built-in Tailscale stands when it's what the phone needs to reach a Mac
/// away from home.
enum AwaySetup: Equatable { case turnOn, signIn, waitingApproval, broken, macSetup, app }

/// The one thing standing between the phone and the active Mac, named by cause.
/// Each cause has its own title, one sentence and the button that fixes it;
/// addresses and error codes stay behind Details.
enum ConnectionIssue: Equatable {
    case connecting(ReconnectReason?)
    case phoneOffline
    case notAnswering(away: Bool)
    case awayNeedsTailscale(AwaySetup)
    case lpmNotRunning
    case secureFailed
    case notRecognized
    case identityChanged
    case identityRejected
    case farewell(Farewell)
    case pairUnreachable(overTailscale: Bool)
    case codeRejected
    case pairingUnavailable
    case qrMismatch

    var isConnecting: Bool {
        if case .connecting = self { return true }
        return false
    }

    /// A tap on this iPhone can fix it, so it earns a bar of its own. The rest
    /// only need waiting, and the line under the Mac's name says so.
    var needsYou: Bool {
        copy(mac: "your Mac").actions.contains { $0 != .retry && $0 != .details }
    }
}

/// A button an issue offers. The view decides how each is carried out.
enum IssueAction: Equatable {
    case retry, pairAgain, compareCode, turnOnTailscale, signInTailscale
    case tailscaleSettings, openAdmin, phoneSettings, details, enterNewCode

    func label(for issue: ConnectionIssue) -> String {
        switch self {
        case .retry:
            if case .farewell = issue { return "Try now" }
            return "Try again"
        case .pairAgain: return "Pair again"
        case .compareCode: return "Compare code"
        case .turnOnTailscale: return "Turn on"
        case .signInTailscale: return "Sign in"
        case .tailscaleSettings: return "Set up"
        case .openAdmin: return "Open admin console"
        case .phoneSettings: return "Open Settings"
        case .details: return "Details"
        case .enterNewCode: return "Enter a new code"
        }
    }
}

struct IssueCopy: Equatable {
    enum Tone: Equatable { case waiting, problem }

    let title: String
    let message: String
    let icon: String
    let tone: Tone
    let actions: [IssueAction]
}

extension ConnectionIssue {
    /// `mac` is how the machine is named in a sentence ("MacBook Pro", or "your
    /// Mac" while its name is still an address).
    func copy(mac: String) -> IssueCopy {
        let Mac = mac.hasPrefix("your ") ? "Your " + mac.dropFirst(5) : mac
        switch self {
        case .connecting(let reason):
            let message: String
            switch reason {
            case .leftWiFi: message = "Left Wi-Fi. Reaching \(mac) away from home…"
            case .joinedWiFi: message = "Joined Wi-Fi. Looking for \(mac) on this network…"
            case .backOnline: message = "Back online. Reconnecting…"
            case nil: message = "Checking its home and Tailscale addresses"
            }
            return IssueCopy(title: "Connecting to \(mac)…", message: message,
                             icon: "arrow.triangle.2.circlepath", tone: .waiting, actions: [.details])
        case .phoneOffline:
            return IssueCopy(title: "This iPhone is offline",
                             message: "lpm reconnects when you're back online.",
                             icon: "wifi.slash", tone: .problem, actions: [.phoneSettings])
        case .notAnswering(let away):
            return IssueCopy(title: "\(Mac) isn't answering",
                             message: away ? "It may be asleep or off the internet. lpm keeps trying."
                                           : "It may be asleep, or lpm isn't open. lpm keeps trying.",
                             icon: "moon.zzz", tone: .problem, actions: [.retry, .details])
        case .awayNeedsTailscale(let setup):
            switch setup {
            case .turnOn:
                return IssueCopy(title: "Built-in Tailscale is off",
                                 message: "Turn it on to reach \(mac) away from home.",
                                 icon: "network", tone: .problem, actions: [.turnOnTailscale, .details])
            case .signIn:
                return IssueCopy(title: "Sign in to Built-in Tailscale",
                                 message: "Sign in once with your Tailscale account to reach \(mac) from here.",
                                 icon: "network", tone: .problem, actions: [.signInTailscale, .details])
            case .waitingApproval:
                return IssueCopy(title: "Waiting for Tailscale approval",
                                 message: "Your Tailscale network asks an admin to approve this iPhone first.",
                                 icon: "network", tone: .waiting, actions: [.openAdmin, .details])
            case .broken:
                return IssueCopy(title: "Built-in Tailscale can't connect",
                                 message: "Open its settings to see what's wrong.",
                                 icon: "network", tone: .problem, actions: [.tailscaleSettings, .details])
            case .macSetup:
                return IssueCopy(title: "\(Mac) only answers on its home network",
                                 message: "Set up Tailscale on the Mac and this iPhone to use lpm from anywhere.",
                                 icon: "network", tone: .problem, actions: [.tailscaleSettings, .details])
            case .app:
                return IssueCopy(title: "Can't reach \(mac) over Tailscale",
                                 message: "Check that the Tailscale app is connected on this iPhone and the Mac is awake.",
                                 icon: "network", tone: .problem, actions: [.retry, .details])
            }
        case .lpmNotRunning:
            return IssueCopy(title: "lpm isn't running on \(mac)",
                             message: "Open lpm on the Mac, then try again.",
                             icon: "app.dashed", tone: .problem, actions: [.retry, .details])
        case .secureFailed:
            return IssueCopy(title: "Couldn't connect securely",
                             message: "Update lpm on \(mac) and lpm Link on this iPhone, then try again.",
                             icon: "lock.trianglebadge.exclamationmark", tone: .problem,
                             actions: [.retry, .pairAgain, .details])
        case .notRecognized:
            return IssueCopy(title: "\(Mac) no longer recognizes this iPhone",
                             message: "Pair again to keep using it here.",
                             icon: "macbook.and.iphone", tone: .problem, actions: [.pairAgain])
        case .identityChanged:
            return IssueCopy(title: "Check that it's \(mac)",
                             message: "It has a new security identity. Compare a short code before connecting.",
                             icon: "exclamationmark.shield", tone: .problem, actions: [.compareCode])
        case .identityRejected:
            return IssueCopy(title: "Identity check failed",
                             message: "lpm stopped connecting to \(mac) to keep this iPhone safe. Pair again when you're next to it.",
                             icon: "xmark.shield", tone: .problem, actions: [.pairAgain])
        case .farewell(let farewell):
            let since = "Since \(farewell.at.formatted(date: .omitted, time: .shortened))."
            switch farewell.reason {
            case .sleep:
                return IssueCopy(title: "\(Mac) is asleep",
                                 message: "\(since) Wake it and lpm reconnects by itself.",
                                 icon: "moon.fill", tone: .waiting, actions: [.retry])
            case .quit:
                return IssueCopy(title: "lpm was closed on \(mac)",
                                 message: "Open lpm on the Mac to keep going.",
                                 icon: "app.dashed", tone: .waiting, actions: [.retry])
            case .off:
                return IssueCopy(title: "Remote control is off on \(mac)",
                                 message: "Turn it on in lpm → Settings → Mobile devices.",
                                 icon: "iphone.slash", tone: .waiting, actions: [.retry])
            }
        case .pairUnreachable(let overTailscale):
            return IssueCopy(title: "\(Mac) isn't answering",
                             message: overTailscale
                                ? "Check that lpm is open and Tailscale is connected on both devices."
                                : "Check that lpm is open and you're on the same Wi-Fi.",
                             icon: "wifi.exclamationmark", tone: .problem, actions: [.retry, .details])
        case .codeRejected:
            return IssueCopy(title: "That code didn't work",
                             message: "Codes work once and expire after 10 minutes. Get a new one in lpm → Settings → Mobile devices.",
                             icon: "key.slash", tone: .problem, actions: [.enterNewCode])
        case .pairingUnavailable:
            return IssueCopy(title: "\(Mac) couldn't save this pairing",
                             message: "Its Mobile devices settings show what to fix. Then pair again.",
                             icon: "exclamationmark.triangle", tone: .problem, actions: [.retry])
        case .qrMismatch:
            return IssueCopy(title: "This QR code doesn't match the Mac",
                             message: "Show a fresh code in lpm → Settings → Mobile devices, then scan again.",
                             icon: "qrcode", tone: .problem, actions: [.enterNewCode])
        }
    }
}

/// Everything the issue depends on, gathered by the model so the rules below
/// stay a pure function.
struct LinkFacts {
    var state: LpmClient.State
    var pairing = false
    var pairingOverTailscale = false
    var needsRepair = false
    /// A saved Mac with no credential to sign in with, so nothing ever dials.
    var credentialMissing = false
    var identityMismatch = false
    var identityRejected = false
    var online = true
    var onCellular = false
    var atHome = false
    var hasAwayAddress = false
    /// The user said they reach their Macs with the Tailscale app.
    var usesTailscaleApp = false
    var tailscaleEnabled = false
    var tailscaleState = "off"
    var probedAllFailed = false
    var farewell: Farewell?
    var reconnectReason: ReconnectReason?
}

extension ConnectionIssue {
    static func derive(_ f: LinkFacts) -> ConnectionIssue? {
        if case .ready = f.state { return nil }
        if f.identityRejected { return .identityRejected }
        if f.identityMismatch { return .identityChanged }
        if f.needsRepair || f.credentialMissing { return .notRecognized }
        if !f.online { return .phoneOffline }
        if case .failed(let raw) = f.state {
            switch raw {
            case LpmClient.secureFailedError: return .secureFailed
            case LpmClient.refusedError: return f.pairing ? .pairUnreachable(overTailscale: f.pairingOverTailscale)
                : f.farewell.map(ConnectionIssue.farewell) ?? .lpmNotRunning
            case LpmClient.pairingRejectedError: return .codeRejected
            case LpmClient.pairingUnavailableError: return .pairingUnavailable
            case LpmClient.pairMismatchError: return .qrMismatch
            case LpmClient.identityChangedError: return .identityChanged
            case LpmClient.unauthorizedError, LpmClient.noCredentialError: return .notRecognized
            default: return unreachable(f)
            }
        }
        if let farewell = f.farewell, !f.pairing { return awayProblem(f) ?? .farewell(farewell) }
        if f.probedAllFailed { return unreachable(f) }
        return .connecting(f.reconnectReason)
    }

    private static func isAway(_ f: LinkFacts) -> Bool { f.onCellular || !f.atHome }

    /// What keeps a phone away from the Mac's network from reaching it at all —
    /// which outranks anything the Mac said, since it can't connect either way.
    private static func awayProblem(_ f: LinkFacts) -> ConnectionIssue? {
        guard isAway(f) else { return nil }
        if !f.hasAwayAddress { return .awayNeedsTailscale(.macSetup) }
        if !f.tailscaleEnabled { return f.usesTailscaleApp ? nil : .awayNeedsTailscale(.turnOn) }
        switch f.tailscaleState {
        case "needsLogin": return .awayNeedsTailscale(.signIn)
        case "needsApproval": return .awayNeedsTailscale(.waitingApproval)
        case "error", "stopped": return .awayNeedsTailscale(.broken)
        default: return nil
        }
    }

    private static func unreachable(_ f: LinkFacts) -> ConnectionIssue {
        if f.pairing { return .pairUnreachable(overTailscale: f.pairingOverTailscale) }
        if let problem = awayProblem(f) { return problem }
        if let farewell = f.farewell { return .farewell(farewell) }
        guard isAway(f) else { return .notAnswering(away: false) }
        if f.tailscaleEnabled {
            return f.tailscaleState == "running" ? .notAnswering(away: true) : .connecting(f.reconnectReason)
        }
        return .awayNeedsTailscale(.app)
    }
}

/// The line under the Mac's name: how the phone is connected, or why it isn't.
/// Connecting and waiting on the Mac show only here, so it names the cause.
struct LinkStatusLine: Equatable {
    enum Tone: Equatable { case live, waiting, problem }

    let text: String
    let tone: Tone
    var pulse = false

    /// `slow` is a connect that has gone on long enough to say so, `route` how
    /// the phone expects to reach the Mac from its network, and `found` a Mac
    /// just found at a new address on this network.
    static func make(ready: Bool, demo: Bool, kind: AddressKind?, issue: ConnectionIssue?,
                     slow: Bool = false, route: AddressKind? = nil, found: Bool = false) -> LinkStatusLine {
        if demo { return LinkStatusLine(text: "Demo · sample projects", tone: .live) }
        if ready {
            switch kind {
            case .tailscale: return LinkStatusLine(text: "Connected · over Tailscale", tone: .live)
            case .internet: return LinkStatusLine(text: "Connected · over the internet", tone: .live)
            default: return LinkStatusLine(text: "Connected · on your network", tone: .live)
            }
        }
        switch issue {
        case .connecting, nil:
            if slow { return LinkStatusLine(text: "Still connecting", tone: .waiting, pulse: true) }
            if found { return LinkStatusLine(text: "Found it, reconnecting…", tone: .waiting, pulse: true) }
            return LinkStatusLine(text: connecting(over: route), tone: .waiting, pulse: true)
        case .farewell(let f):
            switch f.reason {
            case .sleep: return LinkStatusLine(text: "Asleep since \(f.at.clockStamp)", tone: .waiting)
            case .quit: return LinkStatusLine(text: "lpm is closed", tone: .waiting)
            case .off: return LinkStatusLine(text: "Remote control is off", tone: .waiting)
            }
        case .notAnswering, .pairUnreachable: return LinkStatusLine(text: "Not answering", tone: .problem)
        case .lpmNotRunning: return LinkStatusLine(text: "lpm isn't running", tone: .problem)
        case .awayNeedsTailscale(.app): return LinkStatusLine(text: "Can't reach it over Tailscale", tone: .problem)
        case .phoneOffline: return LinkStatusLine(text: "iPhone is offline", tone: .problem)
        case .notRecognized, .identityRejected: return LinkStatusLine(text: "Not paired", tone: .problem)
        case .identityChanged: return LinkStatusLine(text: "Check its identity", tone: .problem)
        default: return LinkStatusLine(text: "Not connected", tone: .problem)
        }
    }

    private static func connecting(over route: AddressKind?) -> String {
        switch route {
        case .tailscale: return "Connecting over Tailscale…"
        case .internet: return "Connecting over the internet…"
        case .home, .localName: return "Connecting on your network…"
        default: return "Connecting…"
        }
    }
}

extension Date {
    /// A clock time, with the day in front when it isn't today.
    var clockStamp: String {
        formatted(Calendar.current.isDateInToday(self) ? .dateTime.hour().minute()
                                                      : .dateTime.month().day().hour().minute())
    }
}

/// The short code both screens show for a Mac's security identity: the start of
/// its certificate fingerprint, grouped for reading aloud. lpm on the Mac shows
/// the same code under Settings → Mobile devices.
enum IdentityCode {
    static func of(fingerprint: String) -> String {
        let hex = fingerprint.filter(\.isHexDigit).uppercased()
        guard hex.count >= 12 else { return hex }
        let chars = Array(hex.prefix(12))
        return stride(from: 0, to: 12, by: 4).map { String(chars[$0..<$0 + 4]) }.joined(separator: " · ")
    }
}
