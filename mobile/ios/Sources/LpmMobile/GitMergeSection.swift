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
                MergeStatusRow(status: status)
                if case .ready = status {
                    if methods.count > 1 {
                        Picker("Method", selection: Binding(get: { method }, set: { methodRaw = $0.rawValue })) {
                            ForEach(methods) { Text($0.label).tag($0) }
                        }
                    }
                    if offer?.deletesBranch == false {
                        Toggle("Delete branch", isOn: $deleteBranch)
                    }
                    mergeButton(pr)
                }
            } footer: {
                if let error = store.mergeErrors[project] {
                    Text(error).foregroundStyle(.red)
                } else if case .ready = status, offer?.deletesBranch == true {
                    Text("GitHub deletes the branch once it's merged.")
                }
            }
            .task(id: status) {
                guard status == .checking else { return }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if !Task.isCancelled { store.load(project) }
            }
        }
    }

    private func mergeButton(_ pr: GitChecks.PullRequest) -> some View {
        Button {
            Haptics.tap()
            let deletes = offer?.deletesBranch == true || deleteBranch
            AppLock.shared.confirm("Merge pull request #\(pr.number)") {
                store.merge(project, method: method, deleteBranch: deletes)
            }
        } label: {
            ZStack {
                Text("Merge #\(pr.number)").fontWeight(.semibold).opacity(merging ? 0 : 1)
                if merging { ProgressView().tint(.white) }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.green)
        .controlSize(.large)
        .disabled(merging)
        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
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
                    Text("Merged #\(merged.number)").font(.body.weight(.semibold))
                    if !merged.title.isEmpty {
                        Text(merged.title).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        } footer: {
            if merged.deletedBranch {
                Text("Its branch was deleted on GitHub. The branch on your Mac is still checked out.")
            } else {
                Text("The branch on your Mac is still checked out.")
            }
        }
    }
}
