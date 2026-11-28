import SwiftUI

/// The round button under the projects list that takes one spoken or typed
/// request. It's there while the live Mac can turn one into a plan.
struct TalkButton: View {
    @Environment(AppModel.self) private var model

    /// A Mac that's away can't plan, but its sheet stays up through a dropped link.
    private var offered: Bool {
        let talk = model.talk
        guard talk.available, !model.projects.isEmpty else { return false }
        return talk.open || model.link.isReady || model.link.quietReconnect
    }

    var body: some View {
        @Bindable var talk = model.talk
        if offered {
            Button {
                Haptics.tap()
                talk.begin()
            } label: {
                Image(systemName: "waveform")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.accentColor, in: Circle())
                    .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Talk")
            .padding(.bottom, 8)
            // The sheet is glass: the button would glow through it.
            .opacity(talk.open ? 0 : 1)
            .sheet(isPresented: $talk.open) { TalkSheet() }
        }
    }
}
