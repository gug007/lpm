import Foundation

/// Notes state for every project, plus the operations that drive it. Owned by
/// `AppModel` and reached as `model.notes`; the client transport lives on
/// `AppModel` and this store reaches it through `model`.
///
/// Note text and attachment bytes stay in memory for the life of the session and
/// are never written to the phone's disk — the notebook is encrypted on the Mac
/// and this link is the only place its plaintext exists off it.
///
/// Every verb answers off a worker on the Mac and there is no change push, so
/// replies can land out of order and the screen refetches rather than listens.
@Observable @MainActor
final class NotesStore {
    @ObservationIgnored weak var model: AppModel? {
        didSet { search.model = model; attachments.model = model }
    }
    private var client: LpmClient? { model?.client }

    /// Notes search and attachment bytes, reached as `model.notes.search` and
    /// `model.notes.attachments`.
    let search = NotesSearchStore()
    let attachments = NoteAttachmentStore()

    static let pageSize = 50

    // Chats per project, most recently updated first, with their load state.
    var chats: [String: [NoteChat]] = [:]
    var chatsLoaded: Set<String> = []
    var chatsLoading: Set<String> = []
    var chatsError: [String: String] = [:]
    // Chat create/rename/delete in flight (keyed by project for a create, by
    // key(project, chatId) otherwise) and their failures, keyed by project.
    var chatMutating: Set<String> = []
    var chatError: [String: String] = [:]
    // One-shot: the id a create produced, for the list to open.
    var createdChatId: [String: String] = [:]

    // Messages per chat, keyed by key(project, chatId) and held NEWEST FIRST as
    // the wire delivers them. `orderedMessages` flips them for a transcript.
    var messages: [String: [NoteMessage]] = [:]
    var messagesLoading: Set<String> = []
    var pagingKeys: Set<String> = []
    var hasMore: [String: Bool] = [:]
    var messagesError: [String: String] = [:]

    // Posting a note, and per-chat post failures.
    var sending: Set<String> = []
    var sendError: [String: String] = [:]
    // Edit/delete of a single note, keyed by key(project, messageId).
    var noteMutating: Set<String> = []
    var noteError: [String: String] = [:]

    // The project whose notes screen is showing and the chat it has open, so a
    // reconnect replays exactly what the user is looking at.
    @ObservationIgnored private var activeProject: String?
    @ObservationIgnored private var activeChat: [String: String] = [:]
    // The `beforeId` of the page in flight per chat key. A reply whose echoed
    // beforeId doesn't match (or whose chat is closed) is a superseded page.
    @ObservationIgnored private var pendingPage: [String: String] = [:]
    // The text each in-flight edit carries; the reply echoes only the note id, so
    // the accepted text is applied from here.
    @ObservationIgnored private var pendingEdit: [String: String] = [:]
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    func key(_ project: String, _ id: String) -> String { project + "\n" + id }

    // MARK: reads

    func chatList(_ project: String) -> [NoteChat] { chats[project] ?? [] }
    /// The chat's notes oldest-first, the order a transcript reads in.
    func orderedMessages(_ project: String, chatId: String) -> [NoteMessage] {
        (messages[key(project, chatId)] ?? []).reversed()
    }
    func canLoadMore(_ project: String, chatId: String) -> Bool {
        hasMore[key(project, chatId)] ?? false
    }

    // MARK: screen lifecycle

    func screenDidOpen(_ project: String) {
        activeProject = project
        loadChats(project)
    }
    func screenDidClose(_ project: String) {
        if activeProject == project { activeProject = nil }
        search.clear(project)
    }
    func chatDidOpen(_ project: String, chatId: String) {
        activeChat[project] = chatId
        if messages[key(project, chatId)] == nil { loadMessages(project, chatId: chatId) }
    }
    func chatDidClose(_ project: String, chatId: String) {
        if activeChat[project] == chatId { activeChat[project] = nil }
        pendingPage[key(project, chatId)] = nil
    }

    // MARK: chats

    func loadChats(_ project: String) {
        guard !chatsLoading.contains(project) else { return }
        chatsLoading.insert(project)
        chatsError[project] = nil
        client?.requestNotesChats(project: project)
        armTimeout("chats", project, seconds: 25) { [weak self] in
            guard let self, self.chatsLoading.remove(project) != nil else { return }
            if self.chats[project] == nil {
                self.chatsError[project] = "Couldn't reach your Mac. Pull to refresh."
            }
        }
    }

    func createChat(_ project: String, title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !chatMutating.contains(project) else { return }
        chatMutating.insert(project)
        chatError[project] = nil
        client?.notesCreateChat(project: project, title: trimmed)
        armTimeout("createChat", project, seconds: 30) { [weak self] in
            guard let self, self.chatMutating.remove(project) != nil else { return }
            self.chatError[project] = "Creating the chat timed out. Try again."
        }
    }

    func renameChat(_ project: String, chatId: String, title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let k = key(project, chatId)
        guard !trimmed.isEmpty, !chatMutating.contains(k) else { return }
        chatMutating.insert(k)
        chatError[project] = nil
        client?.notesRenameChat(project: project, chatId: chatId, title: trimmed)
        armTimeout("renameChat", k, seconds: 30) { [weak self] in
            guard let self, self.chatMutating.remove(k) != nil else { return }
            self.chatError[project] = "Renaming the chat timed out. Try again."
        }
    }

    func deleteChat(_ project: String, chatId: String) {
        let k = key(project, chatId)
        guard !chatMutating.contains(k) else { return }
        chatMutating.insert(k)
        chatError[project] = nil
        client?.notesDeleteChat(project: project, chatId: chatId)
        armTimeout("deleteChat", k, seconds: 30) { [weak self] in
            guard let self, self.chatMutating.remove(k) != nil else { return }
            self.chatError[project] = "Deleting the chat timed out. Try again."
        }
    }

    // MARK: messages

    /// The newest page for a chat, replacing anything held.
    func loadMessages(_ project: String, chatId: String) {
        let k = key(project, chatId)
        guard !messagesLoading.contains(k) else { return }
        messagesLoading.insert(k)
        messagesError[k] = nil
        requestPage(project, chatId: chatId, beforeId: "")
    }

    /// One page older than everything held. A short page means the history is
    /// exhausted, which `hasMore` records.
    func loadMoreMessages(_ project: String, chatId: String) {
        let k = key(project, chatId)
        guard hasMore[k] ?? false, !messagesLoading.contains(k), !pagingKeys.contains(k),
              let oldest = messages[k]?.last else { return }
        pagingKeys.insert(k)
        requestPage(project, chatId: chatId, beforeId: oldest.id)
    }

    private func requestPage(_ project: String, chatId: String, beforeId: String) {
        let k = key(project, chatId)
        pendingPage[k] = beforeId
        client?.requestNotesMessages(project: project, chatId: chatId,
                                     limit: Self.pageSize, beforeId: beforeId)
        armTimeout("page", k, seconds: 25) { [weak self] in
            guard let self else { return }
            self.pendingPage[k] = nil
            self.messagesLoading.remove(k)
            self.pagingKeys.remove(k)
            if self.messages[k] == nil { self.messagesError[k] = "Couldn't load these notes. Try again." }
        }
    }

    /// Post a note. Attachments ride inline, so anything over the link's per-file
    /// ceiling is refused here rather than sent and rejected.
    func addNote(_ project: String, chatId: String, text: String,
                 attachments drafts: [NoteAttachmentDraft] = []) {
        let k = key(project, chatId)
        guard !sending.contains(k) else { return }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !drafts.isEmpty else { return }
        if drafts.contains(where: { $0.data.count > NoteAttachmentStore.byteLimit }) {
            sendError[k] = "That file is too large to send from your phone. Add it from your Mac instead."
            Haptics.error()
            return
        }
        sending.insert(k)
        sendError[k] = nil
        let payload: [[String: Any]] = drafts.map {
            ["name": $0.name, "mimeType": $0.mimeType, "data": $0.data.base64EncodedString()]
        }
        client?.notesAddMessage(project: project, chatId: chatId, text: text, attachments: payload)
        armTimeout("add", k, seconds: 60) { [weak self] in
            guard let self, self.sending.remove(k) != nil else { return }
            self.sendError[k] = "Sending timed out. Check your Mac and try again."
        }
    }

    func editNote(_ project: String, id: String, text: String) {
        let k = key(project, id)
        guard !noteMutating.contains(k) else { return }
        noteMutating.insert(k)
        noteError[k] = nil
        pendingEdit[k] = text
        client?.notesEditMessage(project: project, id: id, text: text)
        armTimeout("edit", k, seconds: 30) { [weak self] in
            guard let self, self.noteMutating.remove(k) != nil else { return }
            self.noteError[k] = "Saving the change timed out. Try again."
        }
    }

    func deleteNote(_ project: String, id: String) {
        let k = key(project, id)
        guard !noteMutating.contains(k) else { return }
        noteMutating.insert(k)
        noteError[k] = nil
        client?.notesDeleteMessage(project: project, id: id)
        armTimeout("deleteNote", k, seconds: 30) { [weak self] in
            guard let self, self.noteMutating.remove(k) != nil else { return }
            self.noteError[k] = "Deleting the note timed out. Try again."
        }
    }

    // MARK: reply handlers (driven by AppModel.wireNotes)

    func applyChats(_ project: String, _ list: [NoteChat], error: String?) {
        clearTimeout("chats", project)
        chatsLoading.remove(project)
        chatsLoaded.insert(project)
        if let error { chatsError[project] = error } else { chats[project] = list; chatsError[project] = nil }
    }

    func finishCreateChat(_ project: String, chat: NoteChat?, error: String?) {
        clearTimeout("createChat", project)
        chatMutating.remove(project)
        guard let chat else { chatError[project] = error ?? "Couldn't create the chat."; return }
        chats[project, default: []].insert(chat, at: 0)
        createdChatId[project] = chat.id
    }

    func finishRenameChat(_ project: String, chatId: String, error: String?) {
        clearTimeout("renameChat", key(project, chatId))
        chatMutating.remove(key(project, chatId))
        if let error { chatError[project] = error } else { loadChats(project) }
    }

    func finishDeleteChat(_ project: String, chatId: String, error: String?) {
        let k = key(project, chatId)
        clearTimeout("deleteChat", k)
        chatMutating.remove(k)
        if let error { chatError[project] = error; return }
        chats[project]?.removeAll { $0.id == chatId }
        messages[k] = nil
        hasMore[k] = nil
        chatDidClose(project, chatId: chatId)
    }

    func applyMessages(_ project: String, chatId: String, beforeId: String,
                       messages page: [NoteMessage], error: String?) {
        let k = key(project, chatId)
        // A page whose chat was closed, or that answers a superseded request, is
        // no longer what the screen is showing.
        guard pendingPage[k] == beforeId else { return }
        pendingPage[k] = nil
        clearTimeout("page", k)
        messagesLoading.remove(k)
        pagingKeys.remove(k)
        if let error { messagesError[k] = error; return }
        messagesError[k] = nil
        if beforeId.isEmpty { messages[k] = page } else { messages[k, default: []].append(contentsOf: page) }
        hasMore[k] = page.count >= Self.pageSize
    }

    func finishAddNote(_ project: String, chatId: String, message: NoteMessage?, error: String?) {
        let k = key(project, chatId)
        clearTimeout("add", k)
        sending.remove(k)
        guard let message else { sendError[k] = error ?? "Couldn't add the note."; Haptics.error(); return }
        sendError[k] = nil
        if messages[k] != nil { messages[k]?.insert(message, at: 0) }
        // The chats list is ordered by last activity, so this chat is now first.
        if let i = chats[project]?.firstIndex(where: { $0.id == chatId }), i > 0 {
            let chat = chats[project]!.remove(at: i)
            chats[project]?.insert(chat, at: 0)
        }
    }

    func finishEditNote(_ project: String, id: String, error: String?) {
        let k = key(project, id)
        clearTimeout("edit", k)
        noteMutating.remove(k)
        let text = pendingEdit.removeValue(forKey: k)
        if let error { noteError[k] = error; return }
        if let text { applyEditedText(project, id: id, text: text) }
    }

    func finishDeleteNote(_ project: String, id: String, error: String?) {
        let k = key(project, id)
        clearTimeout("deleteNote", k)
        noteMutating.remove(k)
        if let error { noteError[k] = error; return }
        for mk in Array(messages.keys) where mk.hasPrefix(project + "\n") {
            messages[mk]?.removeAll { $0.id == id }
        }
        search.removeHit(project, id: id)
    }

    /// The socket was replaced: nothing in flight can still answer, so drop the
    /// spinners and re-issue whatever the user is actually looking at.
    func handleConnectionReset() {
        timeout.cancelAll()
        chatsLoading = []
        chatMutating = []
        messagesLoading = []
        pagingKeys = []
        sending = []
        noteMutating = []
        pendingPage = [:]
        search.handleConnectionReset(active: activeProject)
        attachments.handleConnectionReset()
        guard let project = activeProject else { return }
        loadChats(project)
        if let chatId = activeChat[project] { loadMessages(project, chatId: chatId) }
    }

    /// Replace a note's text in place after the Mac accepted the edit, so the
    /// transcript updates without refetching (which would drop loaded pages).
    private func applyEditedText(_ project: String, id: String, text: String) {
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        for mk in Array(messages.keys) where mk.hasPrefix(project + "\n") {
            guard let i = messages[mk]?.firstIndex(where: { $0.id == id }), let old = messages[mk]?[i] else { continue }
            var o: [String: Any] = ["id": old.id, "chatId": old.chatId, "ts": old.ts,
                                    "text": text, "editedAt": stamp]
            if let list = old.attachments {
                o["attachments"] = list.map {
                    ["hash": $0.hash, "name": $0.name, "size": $0.size, "mimeType": $0.mimeType] as [String: Any]
                }
            }
            messages[mk]?[i] = NoteMessage(o)
        }
    }

    private func armTimeout(_ op: String, _ key: String, seconds: Double, _ fire: @escaping () -> Void) {
        timeout.arm(op + "\u{0}" + key, seconds: seconds, fire)
    }
    private func clearTimeout(_ op: String, _ key: String) {
        timeout.cancel(op + "\u{0}" + key)
    }
}
