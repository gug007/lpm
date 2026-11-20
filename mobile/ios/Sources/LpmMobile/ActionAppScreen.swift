import SwiftUI

/// An action's app, opened by a tap on its button in place of running a command:
/// the page the Mac made filling a full-height sheet under a bar with its title,
/// how old its data is, Refresh and Done. It asks again every `refresh` seconds
/// while it's open, and runs the project's actions the page asks for.
struct ActionAppScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    let action: Action
    /// Where a terminal the page's run opened goes.
    var onSpawnedTerminal: ((TerminalInfo) -> Void)? = nil

    private var store: ActionPopupStore { model.actionPopups }
    private var state: ActionPopupState { store.state(project: project, action: action.name, view: .tab) }
    private var refresh: Int { state.content?.refresh ?? 0 }

    private var title: String {
        if let title = action.app?.title, !title.isEmpty { return title }
        return action.label
    }

    var body: some View {
        NavigationStack {
            ActionPageContent(project: project, action: action, view: .tab, height: nil)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemGroupedBackground))
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        ActionPageHeading(title: title, updatedAt: state.content?.updatedAt)
                    }
                    ToolbarItem(placement: .cancellationAction) {
                        ActionPageRefreshButton(state: state) {
                            store.reload(project: project, action: action.name, view: .tab)
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }.fontWeight(.semibold)
                    }
                }
        }
        .actionPageRuns(project: project, onSpawnedTerminal: onSpawnedTerminal)
        .presentationDetents([.large])
        .onAppear { store.open(project: project, action: action, view: .tab) }
        .onDisappear { store.close(project: project, action: action.name, view: .tab) }
        .task(id: refresh) {
            guard refresh > 0 else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(refresh) * 1_000_000_000)
                if Task.isCancelled { return }
                store.tick(project: project, action: action.name, view: .tab)
            }
        }
    }
}
