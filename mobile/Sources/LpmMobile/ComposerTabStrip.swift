import SwiftUI

/// A compact strip of prompt tabs above the composer, shown only when a terminal
/// holds 2+ prepared prompts. Each chip previews its prompt and switches to it on
/// tap; the × closes it. New tabs are created from the composer's + menu.
/// A prepared tab summary for the strip. The active tab's `preview` is intentionally
/// blank so typing into it (which changes its text every keystroke) doesn't
/// invalidate the strip — the active prompt is already visible in the editor below.
struct TabStripItem: Equatable, Identifiable {
    let id: UUID
    let preview: String
    let attachmentCount: Int
}

struct ComposerTabStrip: View, Equatable {
    let items: [TabStripItem]
    let activeIndex: Int
    let onSwitch: (Int) -> Void
    let onClose: (Int) -> Void

    // Re-render only when the tab set / active tab / attachment counts change, not
    // on every keystroke re-running the parent body. Closures aren't compared.
    static func == (a: ComposerTabStrip, b: ComposerTabStrip) -> Bool {
        a.items == b.items && a.activeIndex == b.activeIndex
    }

    var body: some View {
        if items.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        TabChip(index: index,
                                preview: item.preview,
                                active: index == activeIndex,
                                attachmentCount: item.attachmentCount,
                                onTap: { onSwitch(index) },
                                onClose: { withAnimation(.easeOut(duration: 0.15)) { onClose(index) } })
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
            Divider().opacity(0.4)
        }
    }
}

private struct TabChip: View {
    let index: Int
    let preview: String
    let active: Bool
    let attachmentCount: Int
    let onTap: () -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Text("\(index + 1)")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(active ? SwiftUI.Color.accentColor : .secondary)
            Button(action: onTap) {
                HStack(spacing: 4) {
                    Text(preview)
                        .font(.system(size: 12))
                        .foregroundStyle(active ? .primary : .secondary)
                        .lineLimit(1)
                    if attachmentCount > 0 {
                        Image(systemName: "paperclip")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 10)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .background(active ? SwiftUI.Color.accentColor.opacity(0.16) : SwiftUI.Color.white.opacity(0.06))
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(active ? SwiftUI.Color.accentColor.opacity(0.5) : .clear))
    }
}
