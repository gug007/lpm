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
    @State private var folderDialog: CommandFolderDialog?

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
                    ForEach(list.subfolders(of: nil), id: \.self) { folder in
                        CommandFolderLink(project: project, scope: scope, folder: folder,
                                          count: list.count(in: folder), dialog: $folderDialog)
                    }
                    NavigationLink {
                        CommandFolderScreen(project: project, scope: scope, folder: nil)
                    } label: {
                        CommandFolderRow(folder: nil, count: list.count(in: nil))
                    }
                    Button { folderDialog = .create } label: {
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
            if let others = list?.otherGroup, !others.isEmpty {
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
                Menu {
                    ForEach(SkillVideo.all) { video in
                        Link(destination: video.url) {
                            Text(video.title)
                            Text(video.length)
                        }
                    }
                } label: {
                    Label("Video guides", systemImage: "play.rectangle.fill")
                }
            }
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
        .modifier(CommandFolderDialogs(project: project, scope: scope, parent: nil, dialog: $folderDialog))
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
}

private struct SkillVideo: Identifiable {
    let id: String
    let title: String
    let length: String

    var url: URL { URL(string: "https://www.youtube.com/watch?v=\(id)")! }

    static let all = [
        SkillVideo(id: "GY0USUZz2ZM", title: "Manage skills in one place", length: "7:00"),
        SkillVideo(id: "MI_GqFpr6ms", title: "Organize skills in folders", length: "3:38"),
    ]
}
