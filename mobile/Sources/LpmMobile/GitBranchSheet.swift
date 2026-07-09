import SwiftUI
import Foundation

/// The switch-branch sheet: loads the project's branches on appear, lists local
/// branches then remote-only ones with the current branch checkmarked, and checks
/// out the tapped branch. On a successful checkout the sheet dismisses; the model
/// refreshes the git snapshot and project list.
struct GitBranchSheet: View {
    @EnvironmentObject var model: AppModel
    let project: Project
    @Environment(\.dismiss) private var dismiss

    private var name: String { project.name }
    private var branches: [GitBranch]? { model.gitBranches[name] }
    private var loading: Bool { model.gitBranchesLoading.contains(name) }
    private var error: String? { model.gitBranchError[name] }
    private var current: String { model.gitCurrentBranch[name] ?? model.gitSnapshots[name]?.branch ?? "" }
    private var checkingOut: String? { model.gitCheckingOut[name] }

    private var localBranches: [GitBranch] { (branches ?? []).filter { !$0.isRemote } }
    private var remoteBranches: [GitBranch] { (branches ?? []).filter { $0.isRemote } }

    private static let isoFormatter = ISO8601DateFormatter()
    private static let relativeFormatter = RelativeDateTimeFormatter()

    var body: some View {
        NavigationStack {
            Group {
                if let branches, !branches.isEmpty {
                    list
                } else if branches == nil, let error {
                    errorState(error)
                } else if branches == nil {
                    loadingState
                } else {
                    ContentUnavailableView("No branches", systemImage: "arrow.trianglehead.branch")
                }
            }
            .navigationTitle("Switch Branch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert(
                "Couldn't switch branch",
                isPresented: Binding(
                    get: { branches != nil && model.gitBranchError[name] != nil },
                    set: { if !$0 { model.gitBranchError[name] = nil } }
                )
            ) {
                Button("OK", role: .cancel) { model.gitBranchError[name] = nil }
            } message: {
                Text(model.gitBranchError[name] ?? "")
            }
        }
        .onAppear { if branches == nil { model.loadGitBranches(name) } }
        .onChange(of: model.gitCheckoutTick[name]) { _, _ in dismiss() }
    }

    private var list: some View {
        List {
            if !localBranches.isEmpty {
                Section("Local") {
                    ForEach(localBranches) { branchRow($0) }
                }
            }
            if !remoteBranches.isEmpty {
                Section("Remote") {
                    ForEach(remoteBranches) { branchRow($0) }
                }
            }
        }
    }

    private func branchRow(_ branch: GitBranch) -> some View {
        let isCurrent = !branch.isRemote && branch.name == current
        return Button {
            model.gitCheckout(name, branch: branch.name, remote: branch.remote)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isCurrent ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(isCurrent ? Color.accentColor : Color.secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(branch.name)
                        .font(.system(size: 15))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let subtitle = subtitle(branch) {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 8)

                if checkingOut == branch.name {
                    ProgressView().controlSize(.small)
                } else if branch.isRemote {
                    Text(branch.remote)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isCurrent || checkingOut != nil)
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading branches…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't load branches", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Retry") { model.loadGitBranches(name) }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
    }

    /// A relative "2 days ago" subtitle from the branch's commit date. The server
    /// may send a unix timestamp or an ISO date; anything unparseable is shown raw.
    private func subtitle(_ branch: GitBranch) -> String? {
        let raw = branch.committerDate.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty else { return nil }
        let date: Date?
        if let seconds = TimeInterval(raw) {
            date = Date(timeIntervalSince1970: seconds)
        } else {
            date = Self.isoFormatter.date(from: raw)
        }
        guard let date else { return raw }
        return Self.relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}
