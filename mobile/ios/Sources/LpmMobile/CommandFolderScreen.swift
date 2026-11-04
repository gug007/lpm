import SwiftUI

/// The commands in one folder of one list (No folder when `folder` is nil).
/// Tapping one edits it; "+" writes a new one here.
struct CommandFolderScreen: View {
    @Environment(AppModel.self) private var model

    let project: String
    let scope: LpmCommandScope
    let folder: String?

    @State private var draft: LpmCommandDraft?

    private var store: LpmCommandsStore { model.lpmCommands }
    private var commands: [LpmCommand] {
        store.lists[project]?.list(scope)?.commands.filter { $0.folder == folder } ?? []
    }

    var body: some View {
        List {
            ForEach(commands) { command in
                Button { draft = .editing(command) } label: {
                    CommandRow(command: command)
                }
                .tint(.primary)
            }
        }
        .navigationTitle(folder ?? "No folder")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if commands.isEmpty {
                ContentUnavailableView {
                    Label("No skills", systemImage: "text.badge.plus")
                } description: {
                    Text("Save a prompt here, then run it by typing /name in a terminal.")
                }
            }
        }
        .refreshable { store.load(project) }
        .onAppear { store.open(project) }
        .onDisappear { store.close(project) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { draft = .new(scope: scope, folder: folder) } label: {
                    Label("New skill", systemImage: "plus")
                }
            }
        }
        .sheet(item: $draft) { draft in
            CommandEditorSheet(project: project, draft: draft).environment(model)
        }
    }
}
