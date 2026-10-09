import SwiftUI

/// Pairing a Mac: the first Mac, another one from "Add a machine", or a saved Mac
/// again. Tailscale comes first so the pairing works from anywhere; then the Macs
/// found on this Wi-Fi (tap, then approve on the Mac), then the QR code and the
/// typed code. The demo stays one tap away for people without a Mac.
struct PairingView: View {
    // Non-nil when shown as a sheet over the projects list: adds a Cancel button
    // that returns to it (reconnecting the previously active Mac).
    var onCancel: (() -> Void)? = nil
    @Environment(AppModel.self) private var model
    @State private var scanning = false
    @State private var discovery = MacDiscovery()
    @State private var resolvingNearbyId: String?
    // The Mac being paired via approve-on-Mac, kept so the waiting sheet can retry
    // and "Enter code instead" can prefill the address.
    @State private var approvalMacName = ""
    @State private var approvalHost = ""
    @State private var approvalPort = Int(MacStore.defaultPort)
    @State private var codeTarget: CodeTarget?
    @State private var lastScan: PairPayload?
    // A scanned code whose Mac has no away-from-home address, held until the user
    // says pairing for this Wi-Fi only is fine.
    @State private var heldScan: PairPayload?
    @State private var showDetails = false
    // Without Tailscale a pairing works only on the Mac's Wi-Fi, so the ways to
    // pair stay hidden until Tailscale is set up or the user accepts that.
    @State private var localOnly = false
    @State private var tailscale = BuiltInTailscale.shared
    @AppStorage(LinkStore.usesTailscaleAppKey) private var usesApp = false

    private struct CodeTarget: Identifiable, Hashable {
        let id = UUID()
        var host = ""
        var port = Int(MacStore.defaultPort)
    }

    private var repairTarget: MacRecord? {
        model.link.repairMacId.flatMap { id in model.macs.first { $0.localId == id } }
    }

    private var pairedServerIds: Set<String> {
        var ids = Set(model.macs.compactMap(\.serverId))
        if let sid = repairTarget?.serverId { ids.remove(sid) }
        return ids
    }

    private var showsWaysToPair: Bool {
        repairTarget != nil || localOnly || AwayFromHomeCard.worksAnywhere(tailscale, usesApp: usesApp)
    }

    private var issue: ConnectionIssue? {
        guard model.link.pairing, codeTarget == nil, let issue = model.link.issue, !issue.isConnecting else { return nil }
        return issue
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if repairTarget == nil { AwayFromHomeCard(localOnly: $localOnly) }
                if showsWaysToPair {
                    NearbyMacsView(discovery: discovery, pairedServerIds: pairedServerIds,
                                   preferredServerId: repairTarget?.serverId,
                                   resolvingId: resolvingNearbyId, onPick: selectNearby)
                    otherWays
                    if let issue { issueCard(issue) }
                }
                if onCancel == nil {
                    Button {
                        model.enterDemo()
                    } label: {
                        Label("No Mac nearby? Try the demo", systemImage: "play.circle")
                            .font(.subheadline)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { discovery.start() }
        .onDisappear { discovery.stop() }
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        .toolbar {
            if let onCancel {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onCancel() }
                }
            }
        }
        .navigationDestination(item: $codeTarget) { target in
            EnterCodeView(host: target.host, port: target.port)
        }
        .sheet(isPresented: $scanning) {
            QRScannerView(onScan: scanned)
        }
        .sheet(isPresented: Binding(
            get: { model.approvalPairing != nil },
            set: { if !$0 { model.cancelApprovalPairing() } }
        )) {
            ApprovalPairingSheet(
                macName: approvalMacName,
                onCancel: { model.cancelApprovalPairing() },
                onRetry: retryApproval,
                onEnterCode: enterCodeInstead
            )
        }
        .alert("This code works on this Wi-Fi only",
               isPresented: Binding(get: { heldScan != nil }, set: { if !$0 { heldScan = nil } })) {
            Button("Pair for this Wi-Fi") {
                if let scan = heldScan { pair(scan) }
                heldScan = nil
            }
            Button("Not now", role: .cancel) { heldScan = nil }
        } message: {
            Text("Tailscale isn't set up on this Mac yet, so lpm Link can reach it only on its Wi-Fi. To use it from anywhere, set up Tailscale in lpm → Settings → Mobile devices and scan a new code — or add it later.")
        }
    }

    // MARK: sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.largeTitle.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if repairTarget == nil { setupVideoLink }
        }
        .padding(.top, onCancel == nil ? 28 : 8)
    }

    private static let setupVideoURL = URL(string: "https://www.youtube.com/watch?v=OGttu6tgb0I")!

    private var setupVideoLink: some View {
        Link(destination: Self.setupVideoURL) {
            Label {
                HStack(spacing: 6) {
                    Text("Watch how to connect").fontWeight(.semibold)
                    Text("3:41").foregroundStyle(Color.secondary).monospacedDigit()
                }
            } icon: {
                Image(systemName: "play.rectangle.fill")
            }
            .font(.callout)
        }
        .padding(.top, 4)
    }

    private var title: String {
        if let repairTarget { return "Pair “\(repairTarget.displayName)” again" }
        return onCancel == nil ? "Connect to your Mac" : "Add a machine"
    }

    private var subtitle: String {
        switch model.link.repairReason {
        case .notRecognized?:
            return "It no longer recognizes this iPhone. Approve it on the Mac — its name and addresses stay as they are."
        case .identity?:
            return "Pairing again confirms it's your Mac. Approve it on the Mac — its name and addresses stay as they are."
        case .chosen?:
            return "Approve this iPhone on the Mac again. Its name and addresses stay as they are."
        case nil:
            return showsWaysToPair
                ? "Open lpm on your Mac. Pick it below, then approve on the Mac."
                : "lpm reaches your Mac from anywhere over Tailscale. Set it up first, or pair for this Wi-Fi only."
        }
    }

    private var otherWays: some View {
        HStack(spacing: 10) {
            wayTile(icon: "qrcode.viewfinder", title: repairTarget == nil ? "Scan QR code" : "Scan QR code instead") {
                scanning = true
            }
            wayTile(icon: "keyboard", title: "Enter a code") {
                codeTarget = CodeTarget()
            }
        }
    }

    private func wayTile(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 20, weight: .medium))
                Text(title).font(.subheadline.weight(.medium)).multilineTextAlignment(.center)
            }
            .foregroundStyle(Color.accentColor)
            .frame(maxWidth: .infinity, minHeight: 64)
            .padding(.vertical, 6)
            .background(Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func issueCard(_ issue: ConnectionIssue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            IssueCard(issue: issue) { action in
                switch action {
                case .retry: if let lastScan { pair(lastScan) } else { scanning = true }
                case .enterNewCode: scanning = true
                case .details: showDetails.toggle()
                default: model.perform(action, for: issue)
                }
            }
            if showDetails {
                ForEach(Array(model.link.checks.keys.sorted()), id: \.self) { host in
                    Text("\(host): \(model.link.checks[host]?.detail ?? "")")
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: flows

    private func scanned(_ payload: PairPayload) {
        let away = payload.hosts.contains { AddressKind.of($0).worksAway }
        if !away && repairTarget == nil && !localOnly {
            heldScan = payload
        } else {
            pair(payload)
        }
    }

    private func pair(_ payload: PairPayload) {
        lastScan = payload
        showDetails = false
        model.pair(hosts: payload.hosts, port: payload.port, code: payload.code,
                   fingerprint: payload.fingerprint)
    }

    /// Tap a nearby Mac: resolve its address and start approve-on-Mac pairing. A
    /// machine that can't show the approval dialog (a headless host) goes straight
    /// to the typed code with its address filled in.
    private func selectNearby(_ mac: MacDiscovery.DiscoveredMac) {
        resolvingNearbyId = mac.id
        Task {
            let resolved = await discovery.resolve(mac)
            resolvingNearbyId = nil
            guard let resolved else { return }
            approvalMacName = mac.displayName
            approvalHost = resolved.host
            approvalPort = Int(resolved.port)
            if mac.requestPair {
                model.pairViaApproval(host: resolved.host, port: Int(resolved.port))
            } else {
                codeTarget = CodeTarget(host: resolved.host, port: Int(resolved.port))
            }
        }
    }

    private func retryApproval() {
        guard !approvalHost.isEmpty else { return }
        model.pairViaApproval(host: approvalHost, port: approvalPort)
    }

    private func enterCodeInstead() {
        model.cancelApprovalPairing()
        codeTarget = CodeTarget(host: approvalHost, port: approvalPort)
    }
}
