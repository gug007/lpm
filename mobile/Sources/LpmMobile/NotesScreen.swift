import SwiftUI

/// A chat thread to push. The title rides along so the thread's nav bar is right
/// before its first page lands.
struct NoteChatRoute: Hashable {
    let id: String
    let title: String
}

/// The Notes screen: a project's notebook as a list of chats, newest activity
/// first, plus project-wide search. Pushed from the project menu, so it only sets
/// an inline title and leans on the wrapping NavigationStack; a row (or a search
/// hit) pushes that chat's thread.
struct NotesScreen: View {
    @Environment(AppModel.self) private var model

    let project: String

    @State private var search = ""
    @State private var route: NoteChatRoute?
    @State private var creating = false
    @State private var newTitle = ""
    @State private var renaming: NoteChat?
    @State private var renameTitle = ""
    @State private var deleting: NoteChat?

    private var notes: NotesStore { model.notes }
    private var chats: [NoteChat] { notes.chatList(project) }
    private var hits: [NoteSearchHit] { notes.search.hits[project] ?? [] }
    private var trimmedSearch: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isSearching: Bool { !trimmedSearch.isEmpty }

    var body: some View {
        List {
            if isSearching {
                ForEach(hits) { hit in hitRow(hit) }
            } else {
                ForEach(chats) { chat in chatRow(chat) }
            }
        }
        .listStyle(.plain)
        .overlay { emptyState }
        .safeAreaInset(edge: .top, spacing: 0) { errorBanner }
        .navigationTitle("Notes")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search notes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    newTitle = ""
                    creating = true
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .disabled(notes.chatMutating.contains(project))
            }
        }
        .refreshable {
            notes.loadChats(project)
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        .task { notes.screenDidOpen(project) }
        .task(id: search) {
            // Fires on appear and on each keystroke; debounce before querying the
            // Mac (this is the initial "nothing searched" state too).
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            if trimmedSearch.isEmpty {
                notes.search.clear(project)
            } else {
                notes.search.search(project, query: trimmedSearch)
            }
        }
        .onDisappear { notes.screenDidClose(project) }
        .onChange(of: notes.createdChatId[project]) { _, id in openCreated(id) }
        .navigationDestination(item: $route) { target in
            NotesChatView(project: project, chatId: target.id, title: target.title)
        }
        .modifier(NotesChatPrompts(
            creating: $creating, newTitle: $newTitle,
            renaming: $renaming, renameTitle: $renameTitle, deleting: $deleting,
            onCreate: { notes.createChat(project, title: $0) },
            onRename: { chat, title in notes.renameChat(project, chatId: chat.id, title: title) },
            onDelete: { chat in
                Haptics.warning()
                notes.deleteChat(project, chatId: chat.id)
            }))
    }

    // MARK: rows

    @ViewBuilder private func chatRow(_ chat: NoteChat) -> some View {
        let busy = notes.chatMutating.contains(notes.key(project, chat.id))
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(chat.title.isEmpty ? "Untitled" : chat.title)
                    .font(.system(size: 16, weight: .medium))
                    .lineLimit(1)
                Text(Self.relativeTime(chat.updatedAt))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            if busy { ProgressView().controlSize(.small) }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture { route = NoteChatRoute(id: chat.id, title: chat.title) }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { deleting = chat } label: {
                Label("Delete", systemImage: "trash")
            }
            Button {
                renameTitle = chat.title
                renaming = chat
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            .tint(.indigo)
        }
    }

    @ViewBuilder private func hitRow(_ hit: NoteSearchHit) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(hit.snippet)
                .font(.system(size: 15))
                .lineLimit(3)
            HStack(spacing: 6) {
                Text(hit.chatTitle.isEmpty ? "Untitled" : hit.chatTitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(Self.relativeTime(hit.ts))
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture { route = NoteChatRoute(id: hit.chatId, title: hit.chatTitle) }
    }

    // MARK: states

    @ViewBuilder private var emptyState: some View {
        if isSearching {
            if !hits.isEmpty {
                EmptyView()
            } else if notes.search.loading.contains(project) {
                ProgressView()
            } else if let message = notes.search.error[project] {
                ContentUnavailableView("Search failed", systemImage: "exclamationmark.triangle",
                                       description: Text(message))
            } else {
                ContentUnavailableView.search(text: trimmedSearch)
            }
        } else if !chats.isEmpty {
            EmptyView()
        } else if let message = notes.chatsError[project] {
            ContentUnavailableView("Notes unavailable", systemImage: "exclamationmark.triangle",
                                   description: Text(message))
        } else if !notes.chatsLoaded.contains(project) {
            ProgressView()
        } else {
            ContentUnavailableView("No notes yet", systemImage: "note.text",
                                   description: Text("Keep ideas, links and snippets for this project here. They stay on your Mac."))
        }
    }

    /// Chat create/rename/delete failures land here rather than in an alert: the
    /// reply can arrive while the alert that started it is still dismissing, and a
    /// presentation raised in that window is swallowed.
    @ViewBuilder private var errorBanner: some View {
        if let message = notes.chatError[project] {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.circle.fill")
                Text(message).font(.system(size: 13))
                Spacer(minLength: 4)
                Button {
                    notes.chatError[project] = nil
                } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.plain)
            }
            .foregroundStyle(.orange)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(.bar)
        }
    }

    // MARK: helpers

    /// Open a chat the user just created. Deferred: the create alert may still be
    /// dismissing when the Mac answers, and SwiftUI drops a push raised in that
    /// window.
    private func openCreated(_ id: String?) {
        guard let id, let chat = chats.first(where: { $0.id == id }) else { return }
        notes.createdChatId[project] = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            route = NoteChatRoute(id: chat.id, title: chat.title)
        }
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    /// `millis`, not seconds — every notes timestamp is unix milliseconds.
    private static func relativeTime(_ millis: Int) -> String {
        guard millis > 0 else { return "" }
        let date = Date(timeIntervalSince1970: Double(millis) / 1000)
        return relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}

/// The chat list's three prompts — create, rename, delete — factored out of the
/// body to keep its modifier chain small enough for the Swift type-checker.
private struct NotesChatPrompts: ViewModifier {
    @Binding var creating: Bool
    @Binding var newTitle: String
    @Binding var renaming: NoteChat?
    @Binding var renameTitle: String
    @Binding var deleting: NoteChat?
    let onCreate: (String) -> Void
    let onRename: (NoteChat, String) -> Void
    let onDelete: (NoteChat) -> Void

    func body(content: Content) -> some View {
        content
            .alert("New chat", isPresented: $creating) {
                TextField("Title", text: $newTitle)
                Button("Create") {
                    onCreate(newTitle)
                    newTitle = ""
                }
                Button("Cancel", role: .cancel) { newTitle = "" }
            }
            .alert("Rename chat", isPresented: Binding(
                get: { renaming != nil }, set: { if !$0 { renaming = nil } }),
                presenting: renaming) { chat in
                TextField("Title", text: $renameTitle)
                Button("Save") {
                    onRename(chat, renameTitle)
                    renaming = nil
                }
                Button("Cancel", role: .cancel) { renaming = nil }
            }
            .confirmationDialog("Delete chat?", isPresented: Binding(
                get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting) { chat in
                Button("Delete", role: .destructive) {
                    onDelete(chat)
                    deleting = nil
                }
                Button("Cancel", role: .cancel) { deleting = nil }
            } message: { chat in
                Text("“\(chat.title)” and every note in it will be removed. This can't be undone.")
            }
    }
}
