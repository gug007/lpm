import Foundation

/// Session-memory state for every project, plus the operations that drive it.
/// Owned by `AppModel` and reached as `model.memory`. The client transport lives
/// on `AppModel`; this store reaches it through `model`.
///
/// Every reply is answered off a worker on the Mac and can land out of order, so
/// each handler is guarded on the echoed project (and session name) before it
/// touches anything.
@Observable @MainActor
final class MemoryStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    // The last loaded folder listing per project, with its load state. A list
    // whose `exists` is false is the empty state, not a failure.
    var lists: [String: MemoryList] = [:]
    var listLoading: Set<String> = []
    var listError: [String: String] = [:]

    // Full documents, keyed by key(project, name). The list's own `content` is a
    // preview, so an editor always reads from here.
    var documents: [String: MemorySession] = [:]
    // Bumped every time a document arrives from the Mac, so an open editor knows
    // to reseed its draft from `documents` (a live refresh or a lost
    // compare-and-swap replaces the text underneath it).
    var documentRevision: [String: Int] = [:]
    var documentLoading: Set<String> = []
    var documentError: [String: String] = [:]

    // Save/delete state, keyed by key(project, name). `savedTick`/`deletedTick`
    // are one-shot signals an open editor watches to dismiss.
    var saving: Set<String> = []
    var saveError: [String: String] = [:] {
        didSet {
            for (k, v) in saveError where oldValue[k] != v { Haptics.error(); break }
        }
    }
    var savedTick: [String: Int] = [:]
    var deleting: Set<String> = []
    var deleteError: [String: String] = [:]
    var deletedTick: [String: Int] = [:]
    // Set when the Mac refused a save because the file moved under us; the
    // document has already been reloaded by the time this appears.
    var conflictNotice: [String: String] = [:]
    // project -> the session name a create just produced, for the list to open.
    var createdName: [String: String] = [:]

    // The project whose memory screen is showing and the session it has open, so
    // a reconnect can replay exactly what the user is looking at.
    @ObservationIgnored private var activeProject: String?
    @ObservationIgnored private var openName: [String: String] = [:]
    // Sessions with unsaved edits: a live refresh must not overwrite the draft
    // under the user's fingers (the save's compare-and-swap catches the clash).
    @ObservationIgnored private var editingKeys: Set<String> = []
    // Names of sessions whose save is a create (no baseline), so the reply can
    // report the new name back to the list.
    @ObservationIgnored private var creatingKeys: Set<String> = []
    // The text each in-flight save carries; the reply echoes only the name, so an
    // accepted save updates the held document from here rather than refetching
    // (which would flash the pre-edit text back into an open editor).
    @ObservationIgnored private var pendingSave: [String: String] = [:]
    // Debounced `memory-changed` refresh, keyed by owner folder.
    @ObservationIgnored private var changedWork: [String: DispatchWorkItem] = [:]
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    func key(_ project: String, _ name: String) -> String { project + "\n" + name }

    // MARK: reads

    func sessions(_ project: String) -> [MemorySession] { lists[project]?.sessions ?? [] }
    func document(_ project: String, name: String) -> MemorySession? {
        documents[key(project, name)]
    }
    /// The folder these sessions live in — a duplicate resolves to its original,
    /// so this is not always the project name. Empty until the first load lands.
    func owner(_ project: String) -> String { lists[project]?.owner ?? "" }
    /// True when this project reads and writes another project's sessions.
    func isShared(_ project: String) -> Bool {
        let o = owner(project)
        return !o.isEmpty && o != project
    }
    /// False when the folder doesn't exist yet (the empty state) or nothing has
    /// loaded; a list with sessions is always `true`.
    func folderExists(_ project: String) -> Bool { lists[project]?.exists ?? false }

    // MARK: screen lifecycle

    func screenDidOpen(_ project: String) {
        activeProject = project
        load(project)
    }
    func screenDidClose(_ project: String) {
        if activeProject == project { activeProject = nil }
    }
    func sessionDidClose(_ project: String, name: String) {
        if openName[project] == name { openName[project] = nil }
        editingKeys.remove(key(project, name))
    }
    func beginEditing(_ project: String, name: String) { editingKeys.insert(key(project, name)) }
    func endEditing(_ project: String, name: String) { editingKeys.remove(key(project, name)) }

    // MARK: operations

    func load(_ project: String) {
        guard !listLoading.contains(project) else { return }
        listLoading.insert(project)
        listError[project] = nil
        client?.requestMemory(project: project)
        armTimeout("list", project, seconds: 25) { [weak self] in
            guard let self, self.listLoading.remove(project) != nil else { return }
            if self.lists[project] == nil {
                self.listError[project] = "Couldn't reach your Mac. Pull to refresh."
            }
        }
    }

    /// Fetch one session's full markdown (the list only carries a preview).
    func openSession(_ project: String, name: String) {
        let k = key(project, name)
        openName[project] = name
        guard !documentLoading.contains(k) else { return }
        documentLoading.insert(k)
        documentError[k] = nil
        client?.requestMemorySession(project: project, name: name)
        armTimeout("doc", k, seconds: 25) { [weak self] in
            guard let self, self.documentLoading.remove(k) != nil else { return }
            if self.documents[k] == nil {
                self.documentError[k] = "Couldn't open this session. Try again."
            }
        }
    }

    /// Save an edited session. `baseline` is the text the phone loaded: the write
    /// lands only if the file still reads exactly like that, so an agent CLI
    /// writing the same file first is caught instead of overwritten.
    func save(_ project: String, name: String, content: String, baseline: String?) {
        let k = key(project, name)
        guard !saving.contains(k) else { return }
        saving.insert(k)
        saveError[k] = nil
        conflictNotice[k] = nil
        pendingSave[k] = content
        client?.saveMemorySession(project: project, name: name, content: content, baseline: baseline)
        armTimeout("save", k, seconds: 30) { [weak self] in
            guard let self, self.saving.remove(k) != nil else { return }
            self.saveError[k] = "Saving timed out. Check your Mac and try again."
        }
    }

    /// Create a new session. Unlike `save` this carries no baseline, so it also
    /// overwrites a file an agent created between the two screens.
    func create(_ project: String, name: String, content: String) {
        creatingKeys.insert(key(project, name))
        save(project, name: name, content: content, baseline: nil)
    }

    func delete(_ project: String, name: String) {
        let k = key(project, name)
        guard !deleting.contains(k) else { return }
        deleting.insert(k)
        deleteError[k] = nil
        client?.deleteMemorySession(project: project, name: name)
        armTimeout("delete", k, seconds: 30) { [weak self] in
            guard let self, self.deleting.remove(k) != nil else { return }
            self.deleteError[k] = "Deleting timed out. Try again."
        }
    }

    func consumeConflict(_ project: String, name: String) { conflictNotice[key(project, name)] = nil }
    func consumeCreated(_ project: String) { createdName[project] = nil }
    func consumeSaveError(_ project: String, name: String) { saveError[key(project, name)] = nil }

    // MARK: reply handlers (driven by AppModel.wireMemory)

    func applyList(_ project: String, _ list: MemoryList?, error: String?) {
        clearTimeout("list", project)
        listLoading.remove(project)
        if let list {
            lists[project] = list
            listError[project] = nil
        } else {
            listError[project] = error ?? "Couldn't load session memory."
        }
    }

    func applySession(_ project: String, name: String, session: MemorySession?, error: String?) {
        let k = key(project, name)
        clearTimeout("doc", k)
        documentLoading.remove(k)
        if let session {
            documents[k] = session
            documentRevision[k, default: 0] += 1
            documentError[k] = nil
        } else {
            documentError[k] = error ?? "Couldn't open this session."
        }
    }

    func finishSave(_ project: String, name: String, error: String?) {
        let k = key(project, name)
        clearTimeout("save", k)
        saving.remove(k)
        let wasCreate = creatingKeys.remove(k) != nil
        let saved = pendingSave.removeValue(forKey: k)
        // The Mac reports a lost compare-and-swap as the bare literal "modified";
        // the user never sees that word — the draft is dropped and the latest
        // version reloaded underneath the editor.
        if error == "modified" {
            conflictNotice[k] = "Changed on your Mac by an agent — reloaded the latest version."
            editingKeys.remove(k)
            Haptics.error()
            openSession(project, name: name)
            load(project)
            return
        }
        if let error {
            saveError[k] = error
            return
        }
        Haptics.success()
        savedTick[k, default: 0] += 1
        editingKeys.remove(k)
        if let saved, let old = documents[k] { documents[k] = old.replacingContent(saved) }
        if wasCreate { createdName[project] = name }
        load(project)
    }

    func finishDelete(_ project: String, name: String, error: String?) {
        let k = key(project, name)
        clearTimeout("delete", k)
        deleting.remove(k)
        if let error {
            deleteError[k] = error
            Haptics.error()
            return
        }
        Haptics.success()
        deletedTick[k, default: 0] += 1
        documents[k] = nil
        documentError[k] = nil
        sessionDidClose(project, name: name)
        load(project)
    }

    /// A `memory-changed` push. `owner` is the folder that changed, which for a
    /// duplicate is its original — refresh every project pointing at it, plus a
    /// project of that name whose owner isn't known yet. Coalesced so an agent
    /// writing in bursts triggers one refresh.
    func changed(_ owner: String) {
        changedWork[owner]?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.refreshOwner(owner) }
        changedWork[owner] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    private func refreshOwner(_ ownerName: String) {
        changedWork[ownerName] = nil
        var targets = Set(lists.keys).filter { $0 == ownerName || owner($0) == ownerName }
        if let active = activeProject, active == ownerName || owner(active) == ownerName {
            targets.insert(active)
        }
        for project in targets {
            load(project)
            // Reload the open document too, unless it has unsaved edits — those
            // stay, and the save's compare-and-swap reports the clash.
            if let name = openName[project], !editingKeys.contains(key(project, name)) {
                openSession(project, name: name)
            }
        }
    }

    /// The socket was replaced: nothing in flight can still answer, so drop the
    /// spinners and re-issue whatever the user is actually looking at.
    func handleConnectionReset() {
        timeout.cancelAll()
        listLoading = []
        documentLoading = []
        saving = []
        deleting = []
        guard let project = activeProject else { return }
        load(project)
        if let name = openName[project] { openSession(project, name: name) }
    }

    /// Everything for this project forgotten (used when a project is gone).
    func clear(_ project: String) {
        lists[project] = nil
        listError[project] = nil
        listLoading.remove(project)
        for k in Array(documents.keys) where k.hasPrefix(project + "\n") { documents[k] = nil }
        openName[project] = nil
    }

    private func armTimeout(_ op: String, _ key: String, seconds: Double, _ fire: @escaping () -> Void) {
        timeout.arm(op + "\u{0}" + key, seconds: seconds, fire)
    }
    private func clearTimeout(_ op: String, _ key: String) {
        timeout.cancel(op + "\u{0}" + key)
    }
}

private extension MemorySession {
    /// The same session carrying text the Mac has just accepted. Built through
    /// the wire initializer because the type is decode-only.
    func replacingContent(_ text: String) -> MemorySession {
        MemorySession(["name": name, "title": title, "path": path,
                       "updatedAt": Int(Date().timeIntervalSince1970),
                       "size": text.utf8.count, "content": text])
    }
}
