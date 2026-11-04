import SwiftUI
import UIKit

/// A passing message from a composer: what just happened, or why it couldn't,
/// without stopping you to tap OK.
struct ComposerToast: Equatable, Identifiable {
    let id = UUID()
    let text: String
    /// The button's title; the host says what it does.
    var action: String? = nil
}

/// Shows a composer's toast floating just above it, over whatever is behind, so
/// the composer never moves. It leaves by itself, or when tapped.
private struct ComposerToastHost: ViewModifier {
    private static let visibleFor: Duration = .seconds(6)
    private static let corner: CGFloat = 18

    @Binding var toast: ComposerToast?
    let onAction: () -> Void

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                // A line along the composer's top edge, which the toast rises from.
                SwiftUI.Color.clear
                    .frame(height: 0)
                    .overlay(alignment: .bottom) {
                        if let toast {
                            capsule(toast)
                                .padding(.bottom, 8)
                                .id(toast.id)
                                .transition(.opacity.combined(with: .offset(y: 8)))
                                .task(id: toast.id) {
                                    UIAccessibility.post(notification: .announcement, argument: toast.text)
                                    try? await Task.sleep(for: Self.visibleFor)
                                    if !Task.isCancelled, self.toast?.id == toast.id { self.toast = nil }
                                }
                        }
                    }
            }
            .animation(.easeOut(duration: 0.2), value: toast)
    }

    private func capsule(_ toast: ComposerToast) -> some View {
        HStack(spacing: 10) {
            Text(toast.text)
                .font(.footnote)
                .foregroundStyle(.white)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            if let action = toast.action {
                Button {
                    self.toast = nil
                    onAction()
                } label: {
                    Text(action)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(.white, in: Capsule())
                        .fixedSize()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, toast.action == nil ? 14 : 6)
        .padding(.vertical, toast.action == nil ? 9 : 6)
        .background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: Self.corner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Self.corner, style: .continuous).strokeBorder(.white.opacity(0.15)))
        .contentShape(RoundedRectangle(cornerRadius: Self.corner, style: .continuous))
        .onTapGesture { self.toast = nil }
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 16)
    }
}

extension View {
    func composerToast(_ toast: Binding<ComposerToast?>, onAction: @escaping () -> Void = {}) -> some View {
        modifier(ComposerToastHost(toast: toast, onAction: onAction))
    }
}
