import SwiftUI

/// An action's popup card, opened from a long press on its button: the page the
/// Mac made and how old it is, refreshed with Refresh and every `refresh` seconds
/// while it's open.
struct ActionPopupSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    let action: Action

    private var store: ActionPopupStore { model.actionPopups }
    private var state: ActionPopupState { store.state(project: project, action: action.name) }
    private var refresh: Int { state.content?.refresh ?? 0 }

    private var title: String {
        if let title = action.popup?.title, !title.isEmpty { return title }
        return action.label
    }

    private var height: CGFloat {
        CGFloat(action.popup?.height ?? ActionPopupInfo.defaultHeight)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                ActionPageContent(project: project, action: action, view: .popup, height: height)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    ActionPageHeading(title: title, updatedAt: state.content?.updatedAt)
                }
                ToolbarItem(placement: .cancellationAction) {
                    ActionPageRefreshButton(state: state) {
                        store.reload(project: project, action: action.name)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { store.open(project: project, action: action) }
        .onDisappear { store.close(project: project, action: action.name) }
        .task(id: refresh) {
            guard refresh > 0 else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(refresh) * 1_000_000_000)
                if Task.isCancelled { return }
                store.tick(project: project, action: action.name)
            }
        }
    }
}
