import SwiftUI

/// A compact strip of prompt tabs above the composer, shown only when a terminal
/// holds 2+ prepared prompts. Each chip previews its prompt and switches to it on
/// tap; the × closes it. New tabs are created from the composer's + menu.
struct ComposerTabStrip: View {
    @ObservedObject var store: ComposerStore

    var body: some View {
        if store.tabs.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(store.tabs.enumerated()), id: \.element.id) { index, tab in
                        TabChip(index: index,
                                preview: tab.preview,
                                active: index == store.activeIndex,
                                attachmentCount: tab.attachments.count,
                                onTap: { store.switchTab(index) },
                                onClose: { withAnimation(.easeOut(duration: 0.15)) { store.closeTab(index) } })
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
