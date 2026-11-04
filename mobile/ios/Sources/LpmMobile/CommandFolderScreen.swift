import SwiftUI

/// One folder of one list (No folder when `folder` is nil): the folders inside it
/// and its commands. Tapping a command edits it; "+" writes a new one here.
struct CommandFolderScreen: View {
    @Environment(AppModel.self) private var model

    let project: String
    let scope: LpmCommandScope
    let folder: String?

    @State private var draft: LpmCommandDraft?
    @State private var folderDialog: CommandFolderDialog?

    private var store: LpmCommandsStore { model.lpmCommands }
    private var list: LpmCommandList? { store.lists[project]?.list(scope) }
    private var commands: [LpmCommand] {
        list?.commands.filter { $0.folder == folder } ?? []
    }
    private var others: [OtherSkill] {
        list?.others(in: folder) ?? []
    }
    /// No folder holds no folders.
    private var subfolders: [String] {
        folder.flatMap { list?.subfolders(of: $0) } ?? []
    }
    private var canAddFolder: Bool { folder != nil && model.lpmNestedFoldersAvailable }

    var body: some View {
        List {
            if !subfolders.isEmpty || canAddFolder {
                Section {
                    ForEach(subfolders, id: \.self) { sub in
                        CommandFolderLink(project: project, scope: scope, folder: sub,
                                          count: list?.count(in: sub) ?? 0, dialog: $folderDialog)
                    }
                    if canAddFolder {
                        Button { folderDialog = .create } label: {
                            Label("New folder", systemImage: "folder.badge.plus")
                        }
                    }
                }
            }
            ForEach(commands) { command in
                Button { draft = .editing(command) } label: {
                    CommandRow(command: command)
                }
                .tint(.primary)
            }
            ForEach(others) { skill in
                NavigationLink {
                    OtherSkillScreen(project: project, scope: scope, name: skill.name)
                } label: {
                    OtherSkillRow(skill: skill)
                }
            }
        }
        .navigationTitle(folder.map(LpmFolderPath.label) ?? "No folder")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if commands.isEmpty && others.isEmpty && subfolders.isEmpty {
                ContentUnavailableView {
                    Label("No skills", systemImage: "text.badge.plus")
                } description: {
                    Text("Save a prompt here, then run it by typing /name in a terminal.")
                }
                .allowsHitTesting(false)
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
        .modifier(CommandFolderDialogs(project: project, scope: scope, parent: folder, dialog: $folderDialog))
    }
}
