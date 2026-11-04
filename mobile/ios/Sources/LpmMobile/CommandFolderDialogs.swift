import SwiftUI

/// A folder dialog showing on a Skills page, if any.
enum CommandFolderDialog: Equatable {
    case create
    case rename(String)
    case delete(String)
}

/// One folder's row, opening its page; long press and swipe rename or delete it.
struct CommandFolderLink: View {
    let project: String
    let scope: LpmCommandScope
    let folder: String
    let count: Int
    @Binding var dialog: CommandFolderDialog?

    var body: some View {
        NavigationLink {
            CommandFolderScreen(project: project, scope: scope, folder: folder)
        } label: {
            CommandFolderRow(folder: folder, count: count)
        }
        .contextMenu { actions }
        .swipeActions(edge: .trailing) { actions }
    }

    @ViewBuilder
    private var actions: some View {
        Button { dialog = .rename(folder) } label: {
            Label("Rename", systemImage: "pencil")
        }
        .tint(.gray)
        Button(role: .destructive) { dialog = .delete(folder) } label: {
            Label("Delete folder", systemImage: "trash")
        }
    }
}

/// "New folder", "Rename folder" and "Delete the … folder?" for the folders inside
/// `parent`, the top of the list when nil.
struct CommandFolderDialogs: ViewModifier {
    @Environment(AppModel.self) private var model

    let project: String
    let scope: LpmCommandScope
    let parent: String?
    @Binding var dialog: CommandFolderDialog?

    @State private var name = ""
    @State private var error: String?

    private var renaming: String? {
        if case .rename(let folder) = dialog { folder } else { nil }
    }
    private var deleting: String? {
        if case .delete(let folder) = dialog { folder } else { nil }
    }

    func body(content: Content) -> some View {
        content
            .onChange(of: dialog) { _, shown in
                if case .rename(let folder) = shown {
                    name = LpmFolderPath.label(folder)
                } else {
                    name = ""
                }
            }
            .alert("New folder", isPresented: creating) {
                TextField("Folder name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Create") { perform(.create, folder: LpmFolderPath.child(parent, name)) }
            }
            .alert("Rename folder", isPresented: isPresent(renaming), presenting: renaming) { folder in
                TextField("Folder name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Rename") {
                    perform(.rename, folder: folder, newName: LpmFolderPath.child(LpmFolderPath.parent(folder), name))
                }
            }
            .alert(deleting.map { "Delete the \(LpmFolderPath.label($0)) folder?" } ?? "",
                   isPresented: isPresent(deleting), presenting: deleting) { folder in
                Button("Delete folder", role: .destructive) { perform(.delete, folder: folder) }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("What's inside moves up a level.")
            }
            .alert("Couldn't change skills", isPresented: hasError, presenting: error) { _ in
                Button("OK", role: .cancel) {}
            } message: { Text($0) }
    }

    private var creating: Binding<Bool> {
        Binding(get: { dialog == .create }, set: { if !$0 { dialog = nil } })
    }

    private var hasError: Binding<Bool> {
        Binding(get: { error != nil }, set: { if !$0 { error = nil } })
    }

    private func isPresent(_ value: String?) -> Binding<Bool> {
        Binding(get: { value != nil }, set: { if !$0 { dialog = nil } })
    }

    private func perform(_ op: LpmFolderOp, folder: String, newName: String? = nil) {
        Task {
            do {
                try await model.lpmCommands.folder(project, op, scope: scope, name: folder, newName: newName)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
