import SwiftUI

/// A bar title's bottom line: the lines the project's uncommitted changes add and
/// remove, across how many files; empty while the tree is clean. Faded while the
/// Mac is away, as the tree may have moved on since.
struct ChangesLine: View {
    @Environment(AppModel.self) private var model
    let project: String
    let stale: Bool

    var body: some View {
        ZStack {
            if let snapshot = model.git.snapshots[project] {
                if snapshot.isRepo && !snapshot.files.isEmpty { Self.summary(snapshot) }
            } else if model.git.loading.contains(project) {
                Capsule()
                    .fill(.quaternary)
                    .frame(width: 84, height: 7)
                    .accessibilityHidden(true)
            }
        }
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(.secondary)
        .monospacedDigit()
        .lineLimit(1)
        .opacity(stale ? 0.5 : 1)
    }

    /// "+52 −5 · 4 files": the dot and the file count take the surrounding style.
    static func summary(_ snapshot: GitSnapshot, spacing: CGFloat = 3) -> some View {
        let added = snapshot.linesAdded ?? 0
        let removed = snapshot.linesRemoved ?? 0
        let files = snapshot.files.count
        return HStack(spacing: spacing) {
            if added > 0 { Text("+\(compactCount(added))").foregroundStyle(.green) }
            if removed > 0 { Text("−\(compactCount(removed))").foregroundStyle(.red) }
            if added + removed > 0 { Text("·").accessibilityHidden(true) }
            Text(files == 1 ? "1 file" : "\(files) files")
        }
    }
}

/// "656", "12.4k", "214k", "1.2M": a count that fits the header.
private func compactCount(_ n: Int) -> String {
    if n < 10_000 { return "\(n)" }
    if n < 1_000_000 { return scaledCount(n, unit: 1_000, suffix: "k") }
    return scaledCount(n, unit: 1_000_000, suffix: "M")
}

private func scaledCount(_ n: Int, unit: Int, suffix: String) -> String {
    let whole = (n + unit / 2) / unit
    if whole >= 100 { return "\(whole)\(suffix)" }
    let tenths = (n * 10 + unit / 2) / unit
    return tenths % 10 == 0 ? "\(tenths / 10)\(suffix)" : "\(tenths / 10).\(tenths % 10)\(suffix)"
}

extension View {
    /// Keeps `project`'s changes current while this screen shows them.
    func followsGitChanges(_ project: String) -> some View {
        modifier(GitChangesFollower(project: project))
    }
}

private struct GitChangesFollower: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    let project: String

    func body(content: Content) -> some View {
        content
            .onAppear { model.git.follow(project) }
            .onDisappear { model.git.unfollow(project) }
            // The Mac's watch reports changes from when it starts, so whatever
            // changed while the phone wasn't listening is fetched on return.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.git.load(project) }
            }
            .onChange(of: model.link.isReady) { _, ready in
                if ready { model.git.load(project) }
            }
    }
}
