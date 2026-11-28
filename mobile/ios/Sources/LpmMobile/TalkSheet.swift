import SwiftUI

/// The Talk button's sheet: ask, wait for the plan, then approve it or read why
/// there isn't one. It stands as tall as what it shows.
struct TalkSheet: View {
    @Environment(AppModel.self) private var model
    @State private var contentHeight: CGFloat = 0

    private var talk: TalkStore { model.talk }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 20)
                .padding(.top, 30)
                .padding(.bottom, 12)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents(contentHeight > 0 ? [.height(contentHeight)] : [.medium])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private var content: some View {
        switch talk.phase {
        case .ask:
            TalkAskView()
        case .planning:
            waiting
        case .plan:
            if let plan = talk.plan { TalkPlanView(plan: plan) }
        case .failed(let unsupported, let message):
            failed(title: unsupported ? "I can't do that from here" : "Couldn't make the plan", message: message)
        }
    }

    private var waiting: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(talk.text.trimmingCharacters(in: .whitespacesAndNewlines))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 10) {
                ProgressView()
                Text("Making the plan…").foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            TalkSheetButton("Cancel") { talk.close() }
        }
    }

    private func failed(title: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.title3.weight(.bold))
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 4) {
                TalkSheetButton("Try again", prominent: true) { talk.tryAgain() }
                TalkSheetButton("Cancel") { talk.close() }
            }
        }
    }
}

/// One of the sheet's full-width buttons: the step forward, or the way out under it.
struct TalkSheetButton: View {
    let title: String
    let prominent: Bool
    let action: () -> Void

    init(_ title: String, prominent: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.prominent = prominent
        self.action = action
    }

    var body: some View {
        if prominent {
            Button(action: action) { label }.buttonStyle(.borderedProminent)
        } else {
            Button(action: action) { label }
        }
    }

    private var label: some View {
        Text(title).frame(maxWidth: .infinity, minHeight: 34)
    }
}
