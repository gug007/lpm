import SwiftUI

/// The three ways to add a project, mirroring the desktop's add flows.
private enum AddProjectMode: String, CaseIterable, Identifiable {
    case local, clone, ssh
    var id: String { rawValue }

    var segmentLabel: String {
        switch self {
        case .local: return "Local"
        case .clone: return "Clone"
        case .ssh: return "SSH"
        }
    }

    var createLabel: String {
        switch self {
        case .local: return "Create"
        case .clone: return "Clone"
        case .ssh: return "Add"
        }
    }
}

/// The in-flight state for all three modes. Each mode reads only the fields it
/// needs; keeping them in one struct means switching modes preserves what was
/// typed. `nameEdited` latches once the user types their own name so the
/// auto-derived name stops overwriting it.
private struct AddProjectDraft {
    var localRoot = ""

    var cloneUrl = ""
    var cloneParent = ""
    var branch = ""

    var hostPick = ""               // "" = nothing picked; MANUAL_PICK = manual entry
    var host = ""
    var user = ""
    var port = "22"
    var identityFile = ""
    var remoteDir = ""

    var name = ""
    var nameEdited = false
}

/// The mobile equivalent of the desktop add-project flows: point lpm at a local
/// folder, clone a repository, or connect to a remote host over SSH. Presented as
/// a sheet; each mode settles through the shared config-mutation cluster, so the
/// Create button spins while the Mac works and the sheet dismisses on success.
struct AddProjectSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private static let manualHostPick = "__manual__"

    @State private var mode: AddProjectMode = .local
    @State private var draft = AddProjectDraft()
    @State private var pendingToken: Int?

    private var validationError: String? {
        switch mode {
        case .local:
            if draft.localRoot.trimmed.isEmpty { return "Choose a folder on your Mac." }
        case .clone:
            if draft.cloneUrl.trimmed.isEmpty { return "Enter a repository address." }
            if draft.cloneParent.trimmed.isEmpty { return "Choose where to put it." }
        case .ssh:
            if draft.host.trimmed.isEmpty { return "Enter a host to connect to." }
            if draft.user.trimmed.isEmpty { return "Enter a user to connect as." }
        }
        if slugify(draft.name).isEmpty { return "Give this project a name." }
        return nil
    }

    private var canCreate: Bool {
        validationError == nil && !model.configMutationInFlight
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Add", selection: $mode) {
                        ForEach(AddProjectMode.allCases) { m in
                            Text(m.segmentLabel).tag(m)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                switch mode {
                case .local: localSection
                case .clone: cloneSection
                case .ssh: sshSection
                }

                nameSection
            }
            .navigationTitle("Add Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.configMutationInFlight {
                        ProgressView()
                    } else {
                        Button(mode.createLabel) { submit() }
                            .fontWeight(.semibold)
                            .disabled(!canCreate)
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.configMutationInFlight)
        .onChange(of: mode) { _, _ in rederiveName() }
        .onChange(of: model.configMutationDoneToken) { _, token in
            if let pending = pendingToken, token > pending {
                Haptics.success()
                dismiss()
            }
        }
        .alert("Couldn't add project", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
        .task(id: mode) {
            if mode == .ssh { model.loadSshHosts() }
        }
    }

    // MARK: sections

    @ViewBuilder private var localSection: some View {
        Section {
            NavigationLink {
                DirBrowserView(title: "Project folder") { path in
                    draft.localRoot = path
                    rederiveName()
                }
            } label: {
                folderRow(label: "Folder on your Mac", value: draft.localRoot)
            }
        } footer: {
            Text("Point lpm at a folder on your Mac — an existing project to pick up where you left off, or a new folder to start something fresh.")
        }
    }

    @ViewBuilder private var cloneSection: some View {
        Section {
            TextField("Repository address", text: $draft.cloneUrl)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: draft.cloneUrl) { _, _ in rederiveName() }
            NavigationLink {
                DirBrowserView(title: "Clone into") { path in
                    draft.cloneParent = path
                }
            } label: {
                folderRow(label: "Clone into", value: draft.cloneParent)
            }
            TextField("Branch (optional)", text: $draft.branch)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        } footer: {
            Text("Downloads a copy of the repository onto your Mac. A large repository can take a little while.")
        }
    }

    @ViewBuilder private var sshSection: some View {
        if sshHostsLoading {
            Section {
                HStack {
                    ProgressView()
                    Text("Looking for saved hosts…").foregroundStyle(.secondary)
                }
            }
        }

        if !model.sshHosts.isEmpty {
            Section {
                Picker("Connect to host", selection: $draft.hostPick) {
                    Text("Select…").tag("")
                    ForEach(model.sshHosts) { h in
                        Text(hostPickLabel(h)).tag(h.name)
                    }
                    Text("Enter manually").tag(Self.manualHostPick)
                }
                .onChange(of: draft.hostPick) { _, pick in applyHostPick(pick) }
            } footer: {
                Text("Pick a saved host to fill in its details, or enter a new one.")
            }
        }

        if sshFieldsVisible {
            Section {
                TextField("Host", text: $draft.host)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: draft.host) { _, _ in
                        detachHostPickIfEdited()
                        rederiveName()
                    }
                TextField("User", text: $draft.user)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: draft.user) { _, _ in rederiveName() }
                TextField("Port", text: $draft.port)
                    .keyboardType(.numberPad)
            } header: {
                Text("Connection")
            } footer: {
                Text("Creates a project that runs on a remote host. Its services, actions, and terminals run over this connection.")
            }

            Section {
                TextField("Identity file (optional)", text: $draft.identityFile)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Remote directory (optional)", text: $draft.remoteDir)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                Text("Leave the identity file blank to use your existing connection defaults. The remote directory is where the shell will start.")
            }
        }
    }

    private var nameSection: some View {
        Section {
            TextField("Project name", text: nameBinding)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        } footer: {
            Text("Used to label the project. Filled in from your choice above — edit it if you like.")
        }
    }

    // MARK: SSH picker helpers

    private var sshHostsLoading: Bool {
        !model.sshHostsLoaded && model.sshHostsError == nil && model.sshHosts.isEmpty
    }

    // Show the manual fields once a host (or "enter manually") is picked, when the
    // Mac reports no saved hosts, or when they couldn't be loaded — mirrors the
    // desktop's `showFields`.
    private var sshFieldsVisible: Bool {
        if !draft.hostPick.isEmpty { return true }
        if model.sshHostsError != nil { return true }
        return model.sshHostsLoaded && model.sshHosts.isEmpty
    }

    private func hostPickLabel(_ h: SshHostInfo) -> String {
        h.user.isEmpty ? h.name : "\(h.name) — \(h.user)"
    }

    private func applyHostPick(_ pick: String) {
        if pick.isEmpty || pick == Self.manualHostPick {
            if pick == Self.manualHostPick {
                draft.host = ""
                draft.user = ""
                draft.port = "22"
                draft.identityFile = ""
            }
            rederiveName()
            return
        }
        guard let match = model.sshHosts.first(where: { $0.name == pick }) else { return }
        // Use the host alias, not its resolved address, so the connection still
        // applies any alias-scoped options configured for it.
        draft.host = match.name
        draft.user = match.user
        draft.port = match.port > 0 ? String(match.port) : "22"
        draft.identityFile = match.identityFile
        rederiveName()
    }

    // If the user edits Host after picking a saved host, drop back to manual so the
    // picker's label doesn't misrepresent what they're connecting to.
    private func detachHostPickIfEdited() {
        guard !draft.hostPick.isEmpty, draft.hostPick != Self.manualHostPick else { return }
        let expected = model.sshHosts.first(where: { $0.name == draft.hostPick })?.name ?? ""
        if draft.host != expected { draft.hostPick = Self.manualHostPick }
    }

    // MARK: name derivation

    // The TextField writes through this binding, so a user edit latches
    // `nameEdited`; the auto-derivation in `rederiveName` mutates `draft.name`
    // directly and leaves the latch alone.
    private var nameBinding: Binding<String> {
        Binding(
            get: { draft.name },
            set: { newValue in
                draft.name = newValue
                draft.nameEdited = true
            }
        )
    }

    private func rederiveName() {
        guard !draft.nameEdited else { return }
        draft.name = suggestedName
    }

    private var suggestedName: String {
        switch mode {
        case .local:
            return slugify(lastPathComponent(draft.localRoot))
        case .clone:
            return slugify(repoName(from: draft.cloneUrl))
        case .ssh:
            let u = draft.user.trimmed
            let h = draft.host.trimmed
            if u.isEmpty && h.isEmpty { return "" }
            return slugify(u.isEmpty || h.isEmpty ? u + h : "\(u)-\(h)")
        }
    }

    // MARK: shared rows & submit

    private func folderRow(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.primary)
            Spacer()
            Text(value.isEmpty ? "Choose…" : value)
                .foregroundStyle(value.isEmpty ? .secondary : .primary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private func submit() {
        guard canCreate else { return }
        Haptics.tap()
        pendingToken = model.configMutationDoneToken
        let name = slugify(draft.name)
        switch mode {
        case .local:
            model.createProject(name: name, root: draft.localRoot.trimmed)
        case .clone:
            model.cloneProject(name: name, url: draft.cloneUrl.trimmed,
                               branch: draft.branch.trimmed, destParent: draft.cloneParent.trimmed)
        case .ssh:
            let ssh: [String: Any] = [
                "host": draft.host.trimmed,
                "user": draft.user.trimmed,
                "port": Int(draft.port.trimmed) ?? 22,
                "key": draft.identityFile.trimmed,
                "dir": draft.remoteDir.trimmed,
            ]
            model.createSshProject(name: name, ssh: ssh)
        }
    }
}

// MARK: helpers

/// Lower-cases and collapses non-alphanumeric runs to single hyphens, trimming
/// them from both ends — mirrors the desktop `slugify` so the Mac's name
/// validation accepts what this produces.
private func slugify(_ s: String) -> String {
    let lowered = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    var mapped = ""
    var inGap = false
    for ch in lowered {
        let allowed = (ch.isASCII && (ch.isLetter || ch.isNumber)) || ch == "_" || ch == "." || ch == "-"
        if allowed {
            mapped.append(ch)
            inGap = false
        } else if !inGap {
            mapped.append("-")
            inGap = true
        }
    }
    return mapped.split(separator: "-", omittingEmptySubsequences: true).joined(separator: "-")
}

private func lastPathComponent(_ path: String) -> String {
    let trimmed = path.hasSuffix("/") ? String(path.dropLast()) : path
    return trimmed.split(separator: "/").last.map(String.init) ?? trimmed
}

/// The repo name from a git URL: drop a trailing slash and `.git`, then take the
/// last path segment (handling both URL and scp-like `git@host:group/repo` forms).
private func repoName(from url: String) -> String {
    var s = url.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasSuffix("/") { s.removeLast() }
    if s.hasSuffix(".git") { s.removeLast(4) }
    if let slash = s.lastIndex(of: "/") {
        s = String(s[s.index(after: slash)...])
    } else if let colon = s.lastIndex(of: ":") {
        s = String(s[s.index(after: colon)...])
    }
    return s
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
