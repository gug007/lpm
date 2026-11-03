import SwiftUI

/// The composer's ways into lpm commands: the Commands screen behind the `/`
/// menu's "Manage commands", the editor behind "Save as command", and a fresh
/// `/` list each time the menu opens after a command changed.
struct ComposerLpmCommands: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: String
    let menuOpen: Bool
    @Binding var showCommands: Bool
    @Binding var draft: LpmCommandDraft?
    let reloadMenu: () -> Void

    @State private var menuRevision = 0

    func body(content: Content) -> some View {
        content
            .onChange(of: menuOpen) { _, open in
                guard open, model.lpmCommands.revision != menuRevision else { return }
                menuRevision = model.lpmCommands.revision
                reloadMenu()
            }
            .sheet(isPresented: $showCommands) {
                NavigationStack {
                    CommandsScreen(project: project)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Done") { showCommands = false }
                            }
                        }
                }
                .environment(model)
            }
            .sheet(item: $draft) { draft in
                CommandEditorSheet(project: project, draft: draft).environment(model)
            }
    }
}
