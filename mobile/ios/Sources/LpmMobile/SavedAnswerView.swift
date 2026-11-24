import SwiftUI

/// The answer an agent tab last ended a turn on, in place of its terminal while the
/// Mac is away, clear of the banner that says when it's from.
struct SavedAnswerView: View {
    let answer: AgentAnswerStore.Answer
    let background: Color
    var topInset: CGFloat = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Last answer")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                MarkdownText(answer.text)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, topInset + 14)
            .padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(background)
        .environment(\.colorScheme, .dark)
    }
}
