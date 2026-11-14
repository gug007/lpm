import SwiftUI
import UIKit

/// The code view a preview shows, for the bar's Find. Set while the view is up.
@Observable @MainActor
final class CodeViewHandle {
    @ObservationIgnored weak var textView: UITextView?
    private(set) var attached = false

    func attach(_ view: UITextView?) {
        textView = view
        attached = view != nil
    }

    func find() {
        textView?.findInteraction?.presentFindNavigator(showingReplace: false)
    }
}

/// The steps after reading a file: mention it in the prompt of the tab it was
/// opened from, see its diff when it has changes, find in it, copy its path.
struct FilePreviewActions: View {
    let onMention: (() -> Void)?
    let onDiff: (() -> Void)?
    let onFind: (() -> Void)?
    let onCopyPath: () -> Void
    @State private var copied = false

    var body: some View {
        HStack(spacing: 0) {
            if let onMention { item("Mention", systemImage: "at", action: onMention) }
            if let onDiff { item("Diff", systemImage: "plus.forwardslash.minus", action: onDiff) }
            if let onFind { item("Find", systemImage: "magnifyingglass", action: onFind) }
            item(copied ? "Copied" : "Copy Path", systemImage: copied ? "checkmark" : "doc.on.doc") {
                onCopyPath()
                Haptics.success()
                copied = true
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .background(.bar)
        .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(for: .seconds(1.5))
            copied = false
        }
    }

    private func item(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .regular))
                    .frame(height: 22)
                Text(title)
                    .font(.caption2)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.accentColor)
    }
}
