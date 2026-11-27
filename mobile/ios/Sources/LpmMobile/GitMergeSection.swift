import SwiftUI

/// The CI sheet's last step: merging the branch's open pull request once GitHub
/// says it can go, with a method the repository allows and its branch deleted on
/// GitHub. The Mac's working copy stays as it is.
struct GitMergeSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    let checks: GitChecks

    @AppStorage("gitMerge.method") private var methodRaw = GitMergeMethod.squash.rawValue
    @State private var deleteBranch = true

    private var store: GitChecksStore { model.gitChecks }
    private var offer: GitMergeOffer? { checks.pr?.merge }
    private var methods: [GitMergeMethod] { offer?.methods ?? [] }
    private var method: GitMergeMethod {
        methods.first { $0.rawValue == methodRaw } ?? methods.first ?? .squash
    }
    private var merging: Bool { store.merging.contains(project) }

    var body: some View {
        if store.canMerge, store.merged[project] == nil, let pr = checks.pr, let status = checks.mergeStatus {
            Section {
                if let watch = armed(pr) {
                    ArmedMergeRow(text: watch.armedText(base: baseName, site: pr.site))
                    cancelButton
                } else {
                    MergeStatusRow(status: status)
                    if offersMerge(status) {
                        if methods.count > 1 {
                            Picker("Method", selection: Binding(get: { method }, set: { methodRaw = $0.rawValue })) {
                                ForEach(methods) { Text($0.label).tag($0) }
                            }
                        }
                        if offer?.deletesBranch == false {
                            Toggle("Delete branch", isOn: $deleteBranch)
                        }
                        if case .ready = status { mergeButton(pr) }
                        if waits(status) { waitButton(pr) }
                        if bypassable(status) { bypassButton(pr) }
                    }
                }
            } footer: {
                if let error = store.mergeErrors[project] {
                    Text(error).foregroundStyle(.red)
                } else if armed(pr) != nil {
                    EmptyView()
                } else if case .ready = status, offer?.deletesBranch == true {
                    Text("GitHub deletes the branch once it's merged.")
                } else if waits(status) {
                    Text(checks.waitText(bypass: offer?.bypassable == true))
                } else if bypassable(status) {
                    Text("Bypassing merges it now, past the rules on \(baseName), as \(pr.site)'s Bypass requirements does.")
                }
            }
            .task(id: status) {
                guard status == .checking else { return }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if !Task.isCancelled { store.load(project) }
            }
        }
    }

    private var deletes: Bool { offer?.deletesBranch == true || deleteBranch }
    private var baseName: String { offer?.baseName ?? "its base branch" }
    private static let buttonInsets = EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
    private var arming: Bool { store.arming.contains(project) }

    /// The Mac's wait to merge this pull request, armed here or at the desk.
    private func armed(_ pr: GitChecks.PullRequest) -> GitMergeWatch? {
        guard let watch = checks.mergeWatch, watch.waiting, watch.number == pr.number else { return nil }
        return watch
    }

    /// The rules hold it back and GitHub lets this person past them.
    private func bypassable(_ status: GitMergeStatus) -> Bool {
        guard store.canMergeWhenReady, offer?.bypassable == true else { return false }
        switch status {
        case .blocked, .waitingForChecks: return true
        default: return false
        }
    }

    private func offersMerge(_ status: GitMergeStatus) -> Bool {
        if case .ready = status { return true }
        return waits(status) || bypassable(status)
    }

    /// Checks still run and the Mac can merge once they pass.
    private func waits(_ status: GitMergeStatus) -> Bool {
        status == .waitingForChecks && store.canMergeWhenReady
    }

    private func mergeButton(_ pr: GitChecks.PullRequest) -> some View {
        Button {
            Haptics.tap()
            let deletes = deletes
            AppLock.shared.confirm("Merge \(pr.noun) \(pr.ref)") {
                store.merge(project, method: method, deleteBranch: deletes)
            }
        } label: {
            busyLabel("Merge \(pr.ref)", busy: merging, onColor: true)
        }
        .buttonStyle(.borderedProminent)
        .tint(.green)
        .controlSize(.large)
        .disabled(merging)
        .listRowInsets(Self.buttonInsets)
    }

    private func waitButton(_ pr: GitChecks.PullRequest) -> some View {
        Button {
            Haptics.tap()
            let (deletes, bypass) = (deletes, offer?.bypassable == true)
            AppLock.shared.confirm("Merge \(pr.noun) \(pr.ref) when checks pass") {
                store.mergeWhenReady(project, method: method, deleteBranch: deletes, bypass: bypass)
            }
        } label: {
            busyLabel("Merge When Checks Pass", busy: arming, onColor: true)
        }
        .buttonStyle(.borderedProminent)
        .tint(.green)
        .controlSize(.large)
        .disabled(arming || merging)
        .listRowInsets(Self.buttonInsets)
    }

    private func bypassButton(_ pr: GitChecks.PullRequest) -> some View {
        Button(role: .destructive) {
            Haptics.tap()
            let deletes = deletes
            AppLock.shared.confirm("Bypass the rules and merge \(pr.noun) \(pr.ref)") {
                store.merge(project, method: method, deleteBranch: deletes, bypass: true)
            }
        } label: {
            busyLabel("Bypass Rules and Merge", busy: merging)
        }
        .buttonStyle(.bordered)
        .tint(.red)
        .controlSize(.large)
        .disabled(merging || arming)
        .listRowInsets(Self.buttonInsets)
    }

    private var cancelButton: some View {
        Button {
            Haptics.tap()
            store.cancelMergeWhenReady(project)
        } label: {
            busyLabel("Cancel Merge", busy: arming)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .disabled(arming)
        .listRowInsets(Self.buttonInsets)
    }

    private func busyLabel(_ title: String, busy: Bool, onColor: Bool = false) -> some View {
        ZStack {
            Text(title).fontWeight(.semibold).opacity(busy ? 0 : 1)
            if busy { ProgressView().tint(onColor ? .white : nil) }
        }
        .frame(maxWidth: .infinity)
    }
}

/// The CI sheet while the Mac waits to merge once the checks pass: what it will
/// do (the desktop's PR card while armed).
private struct ArmedMergeRow: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "clock").foregroundStyle(.orange).frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text("Merging when checks pass").font(.body.weight(.semibold))
                Text(text).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// "Ready to merge", or why it can't merge yet.
private struct MergeStatusRow: View {
    let status: GitMergeStatus

    private var title: String {
        switch status {
        case .ready: "Ready to merge"
        case .checking: "Checking the pull request"
        case .waitingForChecks: "Waiting for checks"
        case .blocked: "Can't merge yet"
        }
    }

    private var detail: String {
        switch status {
        case .ready(let detail), .blocked(let detail): detail
        case .checking: "GitHub is working out whether it merges cleanly."
        case .waitingForChecks: "It can merge once every check has finished."
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Group {
                switch status {
                case .ready: Image(systemName: "arrow.triangle.merge").foregroundStyle(.green)
                case .checking, .waitingForChecks: ProgressView().controlSize(.small)
                case .blocked: Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
                }
            }
            .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// The pull request this phone just merged.
struct GitMergedSection: View {
    let merged: MergedPullRequest

    var body: some View {
        Section {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill").foregroundStyle(.green).frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Merged \(merged.ref)").font(.body.weight(.semibold))
                    if !merged.title.isEmpty {
                        Text(merged.title).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        } footer: {
            if merged.deletedBranch {
                Text("Its branch was deleted on \(merged.site). The branch on your Mac is still checked out.")
            } else {
                Text("The branch on your Mac is still checked out.")
            }
        }
    }
}
