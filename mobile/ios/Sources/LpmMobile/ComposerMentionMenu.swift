import SwiftUI

/// Grouped @-mention autocomplete, ordered like the desktop: working-tree changes,
/// then other computers' places, files/dirs, git branches (once a fragment is
/// typed), then context sources — this terminal's output and per-service logs,
/// which inject inline.
struct ComposerMentionMenu: View {
    @Environment(AppModel.self) private var model
    let project: String
    let changed: [MentionEntry]
    let computers: [MentionComputer]
    let files: [MentionEntry]
    let branches: [GitBranch]
    let services: [ServiceInfo]
    let pickPath: (String) -> Void
    let pickPlace: (MentionPlace) -> Void
    let pickBranch: (String) -> Void
    let includeTerminalOutput: Bool
    let pickTerminalOutput: () -> Void
    let pickServiceLog: (ServiceInfo) -> Void
    // The composer forces dark for the terminal; the preview sheet follows the system.
    let previewColorScheme: ColorScheme
    // The file to preview (tapped via the eye button, distinct from the row's
    // primary insert-mention tap).
    @State private var previewTarget: FilePreviewTarget?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if !changed.isEmpty {
                    MenuSectionHeading("Changes")
                    ForEach(changed) { e in pathRow(e) }
                }
                ForEach(computers) { c in
                    MenuSectionHeading(c.heading)
                    ForEach(c.places) { p in
                        contextRow(icon: "desktopcomputer", title: p.label,
                                   subtitle: p.path, action: { pickPlace(p) })
                    }
                }
                if !files.isEmpty {
                    MenuSectionHeading("Files")
                    ForEach(files) { e in pathRow(e) }
                }
                if !branches.isEmpty {
                    MenuSectionHeading("Branches")
                    ForEach(branches) { b in branchRow(b) }
                }
                if includeTerminalOutput || !services.isEmpty {
                    MenuSectionHeading("Context")
                    if includeTerminalOutput {
                        contextRow(icon: "terminal", title: "This terminal's output",
                                   subtitle: "Insert recent output", action: pickTerminalOutput)
                    }
                    ForEach(services) { s in
                        contextRow(icon: "square.stack.3d.up", title: "\(s.name) logs",
                                   subtitle: "Insert recent logs", action: { pickServiceLog(s) })
                    }
                }
            }
        }
        .frame(maxHeight: 260)
        .sheet(item: $previewTarget) { target in
            FilePreviewSheet(target: target).environment(model)
                .environment(\.colorScheme, previewColorScheme)
        }
    }

    @ViewBuilder private func pathRow(_ e: MentionEntry) -> some View {
        HStack(spacing: 0) {
            Button { pickPath(e.path) } label: {
                HStack(spacing: 10) {
                    Image(systemName: e.dir ? "folder" : "doc.text")
                        .font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
                    Text(e.path)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundStyle(.primary).lineLimit(1).truncationMode(.head)
                    Spacer(minLength: 8)
                    if e.changed {
                        Text("changed").font(.system(size: 11, weight: .semibold)).foregroundStyle(.orange)
                    }
                }
                .padding(.leading, 16).padding(.vertical, 9).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // A separate preview tap (files only) that opens the viewer instead of
            // inserting the @-mention.
            if !e.dir {
                Button { previewTarget = FilePreviewTarget(project: project, path: e.path) } label: {
                    Image(systemName: "eye")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .frame(width: 44).padding(.vertical, 9).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Preview")
            } else {
                Spacer().frame(width: 16)
            }
        }
        Divider().opacity(0.4)
    }

    @ViewBuilder private func branchRow(_ b: GitBranch) -> some View {
        Button { pickBranch(b.name) } label: {
            HStack(spacing: 10) {
                Image(systemName: b.isRemote ? "arrow.triangle.branch" : "arrow.branch")
                    .font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
                Text(b.name)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(.primary).lineLimit(1).truncationMode(.head)
                Spacer(minLength: 8)
                if b.isRemote {
                    Text(b.remote).font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().opacity(0.4)
    }

    @ViewBuilder private func contextRow(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13)).foregroundStyle(SwiftUI.Color.accentColor).frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14)).foregroundStyle(.primary).lineLimit(1)
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.middle)
                }
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().opacity(0.4)
    }
}
