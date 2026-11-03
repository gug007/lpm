import SwiftUI

/// A finished Git op's short confirmation — the desktop's "Pulled", "Pushed",
/// "Fetched" and "Committed successfully" toasts. Every notice is distinct, so
/// the same op finishing twice in a row shows again. A discard's notice carries
/// the copy the Mac kept, and offers Undo while it's up.
struct GitNotice: Equatable {
    let id = UUID()
    let text: String
    var discardedCopy: String? = nil
}

/// The project's current Git notice, at the top of the screen like the terminal
/// banners. `isActive` is gated like the op-error alert, so of the screens stacked
/// for one project only the visible one shows it.
private struct GitNoticeBanner: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: String
    let isActive: Bool

    private var notice: GitNotice? { isActive ? model.git.notice[project] : nil }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let notice {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text(notice.text).lineLimit(1)
                        if let copy = notice.discardedCopy {
                            undoButton(copy)
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(.leading, 14)
                    .padding(.trailing, notice.discardedCopy == nil ? 14 : 5)
                    .padding(.vertical, notice.discardedCopy == nil ? 8 : 5)
                    .background(.black.opacity(0.6), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.15)))
                    .environment(\.colorScheme, .dark)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .id(notice.id)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .allowsHitTesting(notice.discardedCopy != nil)
                }
            }
            .animation(.easeOut(duration: 0.2), value: notice)
    }

    private func undoButton(_ copy: String) -> some View {
        Button {
            Haptics.tap()
            model.git.restoreDiscarded(project, id: copy)
        } label: {
            Text("Undo")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.black)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(.white, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

extension View {
    func gitNotice(project: String, isActive: Bool) -> some View {
        modifier(GitNoticeBanner(project: project, isActive: isActive))
    }
}
