import SwiftUI

/// Typed pairing, in the order lpm on the Mac shows it: the code first, then the
/// address under it. The port almost never changes, so it sits out of the way.
struct EnterCodeView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var host: String
    @State private var port: String
    @State private var showDetails = false
    @FocusState private var focus: Field?

    private enum Field { case code, host }

    init(host: String = "", port: Int = Int(MacStore.defaultPort)) {
        _host = State(initialValue: host)
        _port = State(initialValue: String(port))
    }

    /// The address as typed, accepting the "address:port" lpm shows on the Mac.
    private var target: (host: String, port: Int) {
        let typed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = typed.split(separator: ":")
        if parts.count == 2, let p = Int(parts[1]), (1...65535).contains(p) {
            return (String(parts[0]), p)
        }
        return (typed, Int(port) ?? Int(MacStore.defaultPort))
    }

    private var cleanCode: String {
        code.filter { !$0.isWhitespace }.uppercased()
    }

    private var pairing: Bool {
        model.link.pairing && model.connection == .connecting
    }

    private var issue: ConnectionIssue? {
        guard model.link.pairing, let issue = model.link.issue, !issue.isConnecting else { return nil }
        return issue
    }

    var body: some View {
        Form {
            Section("Pairing code") {
                TextField("K7Q4PX", text: $code)
                    .font(.system(.title2, design: .monospaced).weight(.semibold))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .code)
                    .submitLabel(.next)
                    .onSubmit { focus = .host }
            }

            Section {
                TextField("192.168.1.20", text: $host)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .host)
                    .submitLabel(.go)
                    .onSubmit(pair)
                LabeledContent("Port") {
                    TextField("8765", text: $port)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
            } header: {
                Text("Mac address")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Shown under the code in lpm → Settings → Mobile devices.")
                    if let hint = addressHint { Text(hint).foregroundStyle(hintTint) }
                }
            }

            Section {
                Button(action: pair) {
                    HStack(spacing: 8) {
                        if pairing { ProgressView().controlSize(.small) }
                        Text(pairing ? "Pairing…" : "Pair").font(.headline)
                    }
                    .frame(maxWidth: .infinity, minHeight: 32)
                }
                .disabled(cleanCode.isEmpty || target.host.isEmpty || pairing)
            }

            if let issue {
                Section {
                    IssueCard(issue: issue) { action in
                        switch action {
                        case .retry: pair()
                        case .enterNewCode: code = ""; focus = .code
                        case .details: showDetails.toggle()
                        default: model.perform(action, for: issue)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    if showDetails {
                        ForEach(Array(model.link.checks.keys.sorted()), id: \.self) { h in
                            LabeledContent(h, value: model.link.checks[h]?.detail ?? "")
                                .font(.footnote.monospaced())
                        }
                    }
                }
            }
        }
        .navigationTitle("Enter a Code")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if code.isEmpty { focus = .code } }
    }

    /// What the typed address is good for, so a home address isn't mistaken for
    /// one that works away from home.
    private var addressHint: String? {
        let h = target.host
        guard !h.isEmpty else { return nil }
        switch AddressKind.of(h) {
        case .tailscale: return "Tailscale address — works from anywhere."
        case .home, .localName: return "Home network address — works on this Wi-Fi only."
        default: return nil
        }
    }

    private var hintTint: Color {
        AddressKind.of(target.host) == .tailscale ? .green : .orange
    }

    private func pair() {
        guard !cleanCode.isEmpty, !target.host.isEmpty else { return }
        focus = nil
        showDetails = false
        model.pair(hosts: [target.host], port: target.port, code: cleanCode)
    }
}
