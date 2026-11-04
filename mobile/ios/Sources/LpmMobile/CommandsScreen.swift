import SwiftUI

/// The user's lpm commands for one project: this project's own list and the
/// global one, each split into folders. Tapping a folder lists its commands;
/// "+" writes a new one. Pushed from the project menu, or shown in a sheet from
/// the composer's "Manage skills".
struct CommandsScreen: View {
    @Environment(AppModel.self) private var model

    let project: String

    @State private var picked: LpmCommandScope = .project
    @State private var draft: LpmCommandDraft?
    @State private var creatingFolder = false
    @State private var folderName = ""
    @State private var renaming: String?
    @State private var deleting: String?
    @State private var error: String?

    private var store: LpmCommandsStore { model.lpmCommands }
    private var lists: LpmCommandLists? { store.lists[project] }

    /// Global always; the project's own list unless this is no project at all.
    /// One the Mac couldn't read keeps its tab, to say why.
    private var scopes: [LpmCommandScope] {
        if project.isEmpty { return [.global] }
        guard let lists, lists.projectError == nil else { return LpmCommandScope.allCases }
        return lists.scopes
    }
    private var scope: LpmCommandScope { scopes.contains(picked) ? picked : .global }
    private var list: LpmCommandList? { lists?.list(scope) }

    var body: some View {
        List {
            Section {
                if scope == .project, let notice = lists?.projectError {
                    Label(notice, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let list {
                    ForEach(list.folders, id: \.self) { folder in
                        folderLink(folder, count: list.count(in: folder))
                            .contextMenu { folderActions(folder) }
                            .swipeActions(edge: .trailing) { folderActions(folder) }
                    }
                    folderLink(nil, count: list.count(in: nil))
                    Button {
                        folderName = ""
                        creatingFolder = true
                    } label: {
                        Label("New folder", systemImage: "folder.badge.plus")
                    }
                }
            } header: {
                if scopes.count > 1 {
                    Picker("List", selection: $picked) {
                        ForEach(scopes) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .textCase(nil)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 0))
                }
            }
            if let others = list?.others(in: nil), !others.isEmpty {
                Section {
                    NavigationLink {
                        OtherSkillsScreen(project: project, scope: scope)
                    } label: {
                        HStack {
                            Label("Other skills", systemImage: "lock")
                            Spacer()
                            Text("\(others.count)")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
        .navigationTitle("Skills")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { stateOverlay }
        .refreshable { store.load(project) }
        .onAppear { store.open(project) }
        .onDisappear { store.close(project) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { draft = .new(scope: scope) } label: {
                    Label("New skill", systemImage: "plus")
                }
                .disabled(lists == nil)
            }
        }
        .sheet(item: $draft) { draft in
            CommandEditorSheet(project: project, draft: draft).environment(model)
        }
        .alert("New folder", isPresented: $creatingFolder) {
            TextField("Folder name", text: $folderName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { perform(.create, folder: folderName) }
        }
        .alert("Rename folder", isPresented: isPresent($renaming), presenting: renaming) { folder in
            TextField("Folder name", text: $folderName)
            Button("Cancel", role: .cancel) {}
            Button("Rename") { perform(.rename, folder: folder, newName: folderName) }
        }
        .alert(deleting.map { "Delete the \($0) folder?" } ?? "", isPresented: isPresent($deleting),
               presenting: deleting) { folder in
            Button("Delete folder", role: .destructive) { perform(.delete, folder: folder) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Its skills move to No folder.")
        }
        .alert("Couldn't change skills", isPresented: isPresent($error), presenting: error) { _ in
            Button("OK", role: .cancel) {}
        } message: { Text($0) }
    }

    private func folderLink(_ folder: String?, count: Int) -> some View {
        NavigationLink {
            CommandFolderScreen(project: project, scope: scope, folder: folder)
        } label: {
            CommandFolderRow(folder: folder, count: count)
        }
    }

    @ViewBuilder
    private func folderActions(_ folder: String) -> some View {
        Button {
            folderName = folder
            renaming = folder
        } label: {
            Label("Rename", systemImage: "pencil")
        }
        .tint(.gray)
        Button(role: .destructive) { deleting = folder } label: {
            Label("Delete folder", systemImage: "trash")
        }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if lists == nil {
            if let loadError = store.loadError[project] {
                ContentUnavailableView {
                    Label("Couldn't load skills", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { store.load(project) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView()
            }
        }
    }

    private func perform(_ op: LpmFolderOp, folder: String, newName: String? = nil) {
        let scope = scope
        Task {
            do {
                try await store.folder(project, op, scope: scope, name: folder, newName: newName)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func isPresent(_ value: Binding<String?>) -> Binding<Bool> {
        Binding(get: { value.wrappedValue != nil }, set: { if !$0 { value.wrappedValue = nil } })
    }
}
