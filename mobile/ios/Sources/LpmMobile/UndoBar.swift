import SwiftUI

/// The dark capsule an undoable change leaves at the bottom of the screen for a
/// few seconds: what happened, and Undo. It slides up while there's a `message`
/// and away once it's nil; a new `id` swaps in a fresh bar rather than new words.
/// It holds still — a countdown that moves the whole time would keep UI tests
/// from tapping Undo.
struct UndoBar: View {
    let message: String?
    var id: AnyHashable = 0
    let onUndo: () -> Void

    var body: some View {
        Group {
            if let message {
                capsule(message)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(id)
            }
        }
        .animation(.spring(duration: 0.3), value: message == nil ? nil : id)
    }

    private func capsule(_ message: String) -> some View {
        HStack(spacing: 12) {
            Text(message)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.tap()
                withAnimation { onUndo() }
            } label: {
                Text("Undo")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(.white, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(.white)
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .background(Color(white: 0.12), in: Capsule())
        .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
    }
}
