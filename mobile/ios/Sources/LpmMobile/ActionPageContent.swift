import SwiftUI

/// An action's page as the popup sheet or the app screen shows it: a spinner, why
/// it failed with Retry, or the page the Mac made with the amber line under it.
/// `height` is the popup's; nil fills what the app screen offers.
struct ActionPageContent: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var colorScheme
    let project: String
    let action: Action
    let view: ActionPageView
    let height: CGFloat?

    private var store: ActionPopupStore { model.actionPopups }
    private var state: ActionPopupState { store.state(project: project, action: action.name, view: view) }

    var body: some View {
        switch state.phase {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: height ?? .infinity)
                .frame(height: height)
        case .failed(let message, let retry):
            VStack(spacing: 12) {
                Text(message)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if retry {
                    Button("Retry") { store.reload(project: project, action: action.name, view: view) }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                }
            }
            .padding(.horizontal, height == nil ? 24 : 0)
            .frame(maxWidth: .infinity, minHeight: height, maxHeight: height == nil ? .infinity : nil)
        case .shown(let content):
            VStack(alignment: .leading, spacing: 8) {
                ActionPopupWebView(
                    html: content.html ?? "",
                    payload: {
                        ActionPopupPayload.bootstrap(content, project: project, action: action.name,
                                                     view: view, dark: colorScheme == .dark)
                    },
                    push: { ActionPopupPayload.push(content) },
                    page: state.page,
                    pushes: state.pushes,
                    onFailure: { store.pageFailed(project: project, action: action.name, view: view) }
                )
                .frame(height: height)
                if let note = state.note {
                    Text(note)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .lineLimit(1)
                        .padding(.horizontal, height == nil ? 16 : 0)
                        .padding(.bottom, height == nil ? 8 : 0)
                }
            }
        }
    }
}
