import SwiftUI
import UIKit

/// One changed file as its own section (GitHub "Files changed" style): a header
/// that pins while its diff scrolls — collapse chevron, status letter, name over
/// folder and +N −M, the "Wrap" and "Viewed" toggles, a "…" menu — over the whole
/// diff, one List row per block, edge-to-edge. Diffs fetch lazily on first
/// appearance; the List virtualizes the rows, so even huge diffs render fully with
/// no cap.
struct GitFileSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    let file: GitFile
    let selected: Bool
    let collapsed: Bool
    let toggleSelected: () -> Void
    let toggleCollapsed: () -> Void
    let toggleViewed: () -> Void
    let onAsk: (String) -> Void
    /// Asks to discard this file's changes; nil when the Mac can't.
    let onDiscard: (() -> Void)?
    let pins: HeaderPins

    @State private var expanded = false
    @AppStorage("gitReview.wrap") private var wrap = true
    private let softCap = 600

    private var key: String { model.git.diffKey(project, file.path) }
    private var result: GitDiffResult? { model.git.diffs[key] }
    private var loading: Bool { model.git.diffLoading.contains(key) }
    private var error: String? { model.git.diffError[key] }
    private var parsed: ParsedDiff? { model.git.parsedDiff(project, path: file.path) }
    private var viewed: Bool { model.git.isViewed(project, path: file.path) }
    private var promptDiff: String {
        guard let result, !result.binary else { return "" }
        return ParsedDiff.promptDiff(result.diff)
    }

    var body: some View {
        Section {
            if !collapsed {
                content
            }
        } header: {
            header
                .id("file-" + file.path)
                .onAppear {
                    if result == nil && !loading { model.git.loadDiff(project, path: file.path) }
                }
        }
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: toggleCollapsed) {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.secondary)
                        .rotationEffect(.degrees(collapsed ? -90 : 0))
                        .frame(width: 14)
                    GitStatusBadge(status: file.status)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(file.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.primary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        detailLine
                    }
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(file.path)
            .accessibilityValue(collapsed ? "Collapsed" : "Expanded")
            .accessibilityAddTraits(.isButton)

            // Long diff lines wrap to the screen (the default) or scroll sideways,
            // one choice for every file.
            TogglePill(label: "Wrap", tint: .accentColor, on: wrap) { wrap.toggle() }

            TogglePill(
                label: "Viewed",
                icon: viewed ? "checkmark.circle.fill" : "circle",
                tint: .green,
                on: viewed,
                action: toggleViewed
            )

            Menu {
                menuItems
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.secondary)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More")
        }
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        // A bare Divider over an HStack takes its axis and draws a vertical line.
        .overlay(alignment: .bottom) { VStack(spacing: 0) { Divider() } }
        .contentShape(Rectangle())
        .contextMenu { menuItems }
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: {
            pins.header(file.path, bottom: $0)
        }
        .listRowInsets(EdgeInsets())
        .textCase(nil)
    }

    /// The folder, the change counts once parsed, and "Excluded" when the file is
    /// left out of the commit.
    private var detailLine: some View {
        HStack(spacing: 6) {
            if !file.directory.isEmpty {
                Text(file.directory)
                    .lineLimit(1)
                    .truncationMode(.head)
            }
            if let parsed {
                DiffStat(added: parsed.addedCount, removed: parsed.removedCount)
            }
            if !selected {
                Text("Excluded")
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption)
        .foregroundStyle(Color.secondary)
    }

    @ViewBuilder
    private var menuItems: some View {
        Button { onAsk(promptDiff) } label: {
            Label("Ask agent…", systemImage: "sparkles")
        }
        Button(action: toggleSelected) {
            Label(selected ? "Exclude from Commit" : "Include in Commit",
                  systemImage: selected ? "minus.circle" : "plus.circle")
        }
        Button {
            UIPasteboard.general.string = file.path
        } label: {
            Label("Copy Path", systemImage: "doc.on.doc")
        }
        if let onDiscard {
            Divider()
            Button(role: .destructive, action: onDiscard) {
                Label("Discard Changes…", systemImage: "trash")
            }
            .disabled(model.git.discarding.contains(project))
        }
    }

    // MARK: diff

    @ViewBuilder
    private var content: some View {
        if let result {
            if result.binary {
                stateRow { InlineNote(icon: "doc.badge.gearshape", text: "Binary file") }
            } else if result.diff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                stateRow { InlineNote(icon: "doc.plaintext", text: "No changes to show") }
            } else if let parsed {
                let blocks = shownBlocks(parsed)
                ForEach(blocks) { block in
                    blockRow(block, first: block.id == blocks.first?.id)
                }
                if blocks.count < parsed.blocks.count {
                    showAllRow(total: parsed.lines.count)
                }
            } else {
                stateRow { InlineDiffLoading() }
            }
        } else if let error {
            stateRow { InlineDiffError(message: error) { model.git.loadDiff(project, path: file.path) } }
        } else {
            stateRow { InlineDiffLoading() }
        }
    }

    /// Whole blocks up to the soft line cap (unless expanded), so a monster file
    /// doesn't realize thousands of merged-Text lines at once. The cap applies from
    /// line zero; blocks are chunked (≤48 lines) so the first block always fits and
    /// something still renders.
    private func shownBlocks(_ parsed: ParsedDiff) -> [DiffBlock] {
        if expanded { return parsed.blocks }
        var result: [DiffBlock] = []
        var lines = 0
        for block in parsed.blocks {
            if block.kind == .code {
                if lines + block.lineCount > softCap { break }
                lines += block.lineCount
            }
            result.append(block)
        }
        if result.count < parsed.blocks.count, result.last?.kind == .hunk {
            result.removeLast()
        }
        return result
    }

    @ViewBuilder
    private func blockRow(_ block: DiffBlock, first: Bool) -> some View {
        if block.kind == .hunk {
            HunkSeparator(label: block.hunkLabel, context: block.hunkContext, indent: block.indentHint)
                .modifier(FirstRowTracker(path: first ? file.path : nil, pins: pins))
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color(.secondarySystemFill))
        } else {
            codeBlock(block)
                .modifier(FirstRowTracker(path: first ? file.path : nil, pins: pins))
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color(.systemBackground))
        }
    }

    @ViewBuilder
    private func codeBlock(_ block: DiffBlock) -> some View {
        if wrap {
            WrappedDiffCodeBlock(block: block)
        } else {
            DiffCodeBlock(block: block)
        }
    }

    private func showAllRow(total: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { expanded = true }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.down")
                Text("Show all \(total) lines")
            }
            .font(.footnote.weight(.medium))
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color(.secondarySystemGroupedBackground))
    }

    private func stateRow<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        content()
            .modifier(FirstRowTracker(path: file.path, pins: pins))
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
    }
}

/// Reports where a file's first diff row sits, for telling a pinned header; a
/// nil path (any later row) reports nothing. Goes inside the list row modifiers,
/// which only take effect outermost.
private struct FirstRowTracker: ViewModifier {
    let path: String?
    let pins: HeaderPins

    @ViewBuilder
    func body(content: Content) -> some View {
        if let path {
            content.onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: {
                pins.firstRow(path, top: $0)
            }
        } else {
            content
        }
    }
}
