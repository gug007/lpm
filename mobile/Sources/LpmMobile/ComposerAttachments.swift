import SwiftUI

/// The horizontal row of queued attachment chips above the composer input. Each
/// chip shows an image thumbnail or a file glyph + name, its upload state
/// (spinner / failed), and a remove button; tapping opens a preview. The Mac path
/// each upload returns is held on the chip and appended to the message on send —
/// it never appears in the text field.
struct ComposerAttachments: View, Equatable {
    let attachments: [Attachment]
    let onRetry: (UUID) -> Void
    let onRemove: (UUID) -> Void
    @State private var previewing: Attachment?

    // Only re-render when the chips' rendered content actually changes (add/remove,
    // upload state, thumbnail arrival) — not on every keystroke that re-runs the
    // parent composer body. Closures are excluded from the comparison.
    static func == (a: ComposerAttachments, b: ComposerAttachments) -> Bool {
        a.attachments.map(\.renderToken) == b.attachments.map(\.renderToken)
    }

    var body: some View {
        if !attachments.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(attachments) { att in
                        AttachmentChip(attachment: att,
                                       onTap: { att.isFailed ? onRetry(att.id) : (previewing = att) },
                                       onRemove: { onRemove(att.id) })
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .sheet(item: $previewing) { att in
                AttachmentPreview(attachment: att)
            }
        }
    }
}

private struct AttachmentChip: View {
    let attachment: Attachment
    let onTap: () -> Void
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button(action: onTap) {
                content
                    .frame(width: 116, height: 56)
                    .background(SwiftUI.Color.white.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(SwiftUI.Color.white.opacity(0.08)))
            }
            .buttonStyle(.plain)

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.55))
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
        }
    }

    @ViewBuilder private var content: some View {
        HStack(spacing: 8) {
            thumbnail
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.filename)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                statusLine
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
    }

    @ViewBuilder private var thumbnail: some View {
        if let image = attachment.thumbnail {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            Image(systemName: "doc.fill")
                .font(.system(size: 20))
                .foregroundStyle(.secondary)
                .frame(width: 38, height: 38)
                .background(SwiftUI.Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    @ViewBuilder private var statusLine: some View {
        switch attachment.status {
        case .uploading:
            HStack(spacing: 4) {
                ProgressView().controlSize(.mini)
                Text("Uploading…").font(.system(size: 10)).foregroundStyle(.secondary)
            }
        case .uploaded:
            Label("Ready", systemImage: "checkmark.circle.fill")
                .font(.system(size: 10))
                .foregroundStyle(.green)
                .labelStyle(.titleAndIcon)
        case .failed:
            Label("Tap to retry", systemImage: "arrow.clockwise")
                .font(.system(size: 10))
                .foregroundStyle(.orange)
                .labelStyle(.titleAndIcon)
        }
    }
}

/// A full-screen image viewer (images) or filename detail (files) for a chip.
private struct AttachmentPreview: View {
    let attachment: Attachment
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                SwiftUI.Color.black.ignoresSafeArea()
                if let image = attachment.thumbnail {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .padding()
                } else {
                    ContentUnavailableView {
                        Label(attachment.filename, systemImage: "doc.fill")
                    } description: {
                        Text(attachment.mime)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .preferredColorScheme(.dark)
    }
}
