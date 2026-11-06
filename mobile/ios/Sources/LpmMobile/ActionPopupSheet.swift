import SwiftUI

/// An action's popup card, opened from a long press on its button: the page the
/// Mac made and how old it is, refreshed with Refresh and every `refresh` seconds
/// while it's open.
struct ActionPopupSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    let project: String
    let action: Action

    private var store: ActionPopupStore { model.actionPopups }
    private var state: ActionPopupState { store.state(project: project, action: action.name) }
    private var refresh: Int { state.content?.refresh ?? 0 }

    private var title: String {
        if let title = state.content?.title, !title.isEmpty { return title }
        if let title = action.popup?.title, !title.isEmpty { return title }
        return action.label
    }

    private var height: CGFloat {
        ActionPopupInfo.pageHeight(state.content?.height ?? action.popup?.height ?? ActionPopupInfo.defaultHeight)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { heading }
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: reload) {
                        if state.inFlight && state.content != nil {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .accessibilityLabel("Refresh")
                    .disabled(!state.canReload)
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

    @ViewBuilder
    private var content: some View {
        switch state.phase {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity)
                .frame(height: height)
        case .failed(let message, let retry):
            VStack(spacing: 12) {
                Text(message)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if retry {
                    Button("Retry", action: reload)
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                }
            }
            .frame(maxWidth: .infinity, minHeight: height)
        case .shown(let content):
            VStack(alignment: .leading, spacing: 8) {
                ActionPopupWebView(
                    html: content.html ?? "",
                    payload: {
                        ActionPopupPayload.bootstrap(content, project: project, action: action.name,
                                                     dark: colorScheme == .dark)
                    },
                    push: { ActionPopupPayload.push(content) },
                    page: state.page,
                    pushes: state.pushes,
                    onFailure: { store.pageFailed(project: project, action: action.name) }
                )
                .frame(height: height)
                if let note = state.note {
                    Text(note)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .lineLimit(1)
                }
            }
        }
    }

    /// The title, and beside it how old the page's data is, kept current.
    private var heading: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.headline)
                .lineLimit(1)
            if let updatedAt = state.content?.updatedAt, updatedAt > 0 {
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    Text(relativeAgo(Int(updatedAt / 1000), now: context.date))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
        }
    }

    private func reload() {
        store.reload(project: project, action: action.name)
    }
}
