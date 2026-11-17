import SwiftUI
import UIKit

/// The other way to start a memory session, under the empty Memory screen's
/// button: the skill an agent runs, with a copy button, as on the desktop.
struct MemorySkillHint: View {
    static let command = "/lpm-memory"

    @State private var copied = false

    var body: some View {
        HStack(spacing: 6) {
            Text("or ask an agent to run")
                .foregroundStyle(.secondary)
            Button {
                UIPasteboard.general.string = Self.command
                Haptics.success()
                copied = true
            } label: {
                HStack(spacing: 4) {
                    Text("\(Self.command) <name>")
                        .font(.footnote.monospaced())
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        .font(.caption2)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(.quaternary))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Copy command")
        }
        .font(.footnote)
        .padding(.top, 4)
    }
}
