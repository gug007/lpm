import SwiftUI

/// The full message-history surface: a paged, searchable list of sent prompts and
/// drafts with favorites and folders. Tapping a row loads it into the composer;
/// "Send now" sends it straight to the terminal. Backed by the keyset-paginated
/// `historyQuery` (60 rows/page, infinite scroll).
struct HistoryScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    let project: String
    let onLoad: (String) -> Void
    let onSendNow: (String) -> Void

    enum Filter: Equatable {
        case all, favorites, drafts, folder(String)
    }

    @State private var filter: Filter = .all
    @State private var search = ""
    @State private var creatingFolder = false
    @State private var newFolderName = ""
    @State private var movingItem: HistoryItem?

    /// The "Drafts" chip has no server-side flag, so it filters the unscoped query
    /// client-side; every other filter is a server parameter.
    private var items: [HistoryItem] {
        filter == .drafts ? model.historyItems.filter(\.isDraft) : model.historyItems
    }

    var body: some View {
        NavigationStack {
            Group {
                // Only declare "empty" once the server has no more pages — a page
                // with zero matching rows (e.g. a Drafts page of all sent messages)
                // must keep paging, not show the empty state.
                if items.isEmpty && !stillPaging {
                    emptyState
                } else {
                    list
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .safeAreaInset(edge: .top, spacing: 0) { filterBar }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always))
        }
        .preferredColorScheme(.dark)
        .onAppear { model.loadHistoryFolders() }
        .onDisappear { model.historyScreenDidClose() }
        .onChange(of: filter) { _, _ in reload() }
        .task(id: search) {
            // Fires on appear and on each search change; debounce typing before
            // re-querying (this is the initial load too).
            try? await Task.sleep(nanoseconds: 300_000_000)
            reload()
        }
        .alert("New folder", isPresented: $creatingFolder) {
            TextField("Folder name", text: $newFolderName)
            Button("Create") {
                let name = newFolderName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { model.historyCreateFolder(name) }
                newFolderName = ""
            }
            Button("Cancel", role: .cancel) { newFolderName = "" }
        }
        .confirmationDialog("Move to folder", isPresented: Binding(
            get: { movingItem != nil }, set: { if !$0 { movingItem = nil } }),
            titleVisibility: .visible, presenting: movingItem) { item in
            ForEach(model.historyFolders) { folder in
                Button(folder.name) { model.historySetFolder(item.id, folder: folder.id); movingItem = nil }
            }
            if item.folder != nil {
                Button("Remove from folder") { model.historySetFolder(item.id, folder: nil); movingItem = nil }
            }
            Button("New folder…") { movingItem = nil; creatingFolder = true }
            Button("Cancel", role: .cancel) { movingItem = nil }
        }
    }

    private var list: some View {
        List {
            ForEach(items) { item in
                HistoryRowView(item: item, relativeTime: relativeTime(item.timestamp))
                    .contentShape(Rectangle())
                    .onTapGesture { onLoad(displayText(item)); dismiss() }
                    .swipeActions(edge: .leading) {
                        Button {
                            model.historyToggleFavorite(item.id)
                        } label: {
                            Label(item.favorite ? "Unfavorite" : "Favorite",
                                  systemImage: item.favorite ? "star.slash" : "star")
                        }
                        .tint(.yellow)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { model.historyDelete(item.id) } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button { movingItem = item } label: {
                            Label("Folder", systemImage: "folder")
                        }
                        .tint(.indigo)
                    }
                    .contextMenu {
                        Button { onSendNow(displayText(item)); dismiss() } label: {
                            Label("Send now", systemImage: "paperplane")
                        }
                        Button { onLoad(displayText(item)); dismiss() } label: {
                            Label("Load into composer", systemImage: "square.and.pencil")
                        }
                        Button { model.historyToggleFavorite(item.id) } label: {
                            Label(item.favorite ? "Unfavorite" : "Favorite",
                                  systemImage: item.favorite ? "star.slash" : "star")
                        }
                        Button { movingItem = item } label: { Label("Move to folder", systemImage: "folder") }
                        Button(role: .destructive) { model.historyDelete(item.id) } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
            // Pagination sentinel — driven by the RAW page count, not the filtered
            // rows, so a page with no matching rows still loads the next one.
            if stillPaging {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowSeparator(.hidden)
                    .onAppear { model.loadHistoryMore() }
            }
        }
        .listStyle(.plain)
        // Chain through pages that yield no visible rows (e.g. Drafts filter over a
        // page of all-sent messages) until something shows or the server runs out.
        .onChange(of: model.historyItems.count) { _, _ in maybeAutoPage() }
        .onChange(of: model.historyHasMore) { _, _ in maybeAutoPage() }
    }

    /// More pages may still arrive from the server.
    private var stillPaging: Bool {
        model.historyLoading || model.historyLoadingMore || model.historyHasMore
    }

    /// When the filtered list is empty but the server has more, keep paging — the
    /// footer sentinel only fires when visible, which an empty list can't guarantee.
    private func maybeAutoPage() {
        if items.isEmpty, model.historyHasMore, !model.historyLoading, !model.historyLoadingMore {
            model.loadHistoryMore()
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("All", active: filter == .all) { filter = .all }
                chip("Favorites", systemImage: "star.fill", active: filter == .favorites) { filter = .favorites }
                chip("Drafts", systemImage: "pencil", active: filter == .drafts) { filter = .drafts }
                ForEach(model.historyFolders) { folder in
                    chip(folder.name, systemImage: "folder", active: filter == .folder(folder.id)) {
                        filter = .folder(folder.id)
                    }
                    .contextMenu {
                        Button(role: .destructive) {
                            if filter == .folder(folder.id) { filter = .all }
                            model.historyDeleteFolder(folder.id)
                        } label: { Label("Delete folder", systemImage: "trash") }
                    }
                }
                Button { creatingFolder = true } label: {
                    Image(systemName: "folder.badge.plus").font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.ultraThinMaterial)
    }

    private func chip(_ label: String, systemImage: String? = nil, active: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack(spacing: 4) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 11)) }
                Text(label).font(.system(size: 13, weight: .medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(active ? SwiftUI.Color.accentColor : SwiftUI.Color.white.opacity(0.08))
            .foregroundStyle(active ? SwiftUI.Color.white : SwiftUI.Color.primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        Group {
            if model.historyLoading {
                ProgressView()
            } else if !search.isEmpty {
                ContentUnavailableView.search(text: search)
            } else {
                ContentUnavailableView("No messages", systemImage: "clock",
                                       description: Text("Prompts you send and drafts you save appear here."))
            }
        }
    }

    private func reload() {
        let searchText = search.trimmingCharacters(in: .whitespacesAndNewlines)
        switch filter {
        case .all, .drafts:
            model.loadHistoryFirst(project: nil, search: searchText, favoritesOnly: false, folder: nil)
        case .favorites:
            model.loadHistoryFirst(project: nil, search: searchText, favoritesOnly: true, folder: nil)
        case .folder(let id):
            model.loadHistoryFirst(project: nil, search: searchText, favoritesOnly: false, folder: id)
        }
    }

    /// The text to load/send: the message plus any image paths it carries appended.
    private func displayText(_ item: HistoryItem) -> String {
        guard !item.images.isEmpty else { return item.text }
        let paths = item.images.values.sorted().joined(separator: " ")
        let base = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return base.isEmpty ? paths : item.text + (item.text.hasSuffix(" ") ? "" : " ") + paths
    }

    private func relativeTime(_ millis: Int) -> String {
        guard millis > 0 else { return "" }
        let date = Date(timeIntervalSince1970: Double(millis) / 1000)
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt.localizedString(for: date, relativeTo: Date())
    }
}

private struct HistoryRowView: View {
    let item: HistoryItem
    let relativeTime: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(item.text.isEmpty ? "(empty)" : item.text)
                .font(.system(size: 15))
                .foregroundStyle(.primary)
                .lineLimit(3)
            HStack(spacing: 6) {
                if item.isDraft {
                    Text("Draft")
                        .font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(SwiftUI.Color.orange.opacity(0.18))
                        .foregroundStyle(.orange)
                        .clipShape(Capsule())
                }
                if !item.project.isEmpty {
                    Text(item.project)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if item.favorite {
                    Image(systemName: "star.fill").font(.system(size: 10)).foregroundStyle(.yellow)
                }
                if !relativeTime.isEmpty {
                    Text(relativeTime).font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 3)
    }
}
