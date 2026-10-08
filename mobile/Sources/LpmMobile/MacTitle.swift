import SwiftUI

/// The projects list's title: the active Mac's name (the Mac picker) with a line
/// under it saying how the phone is connected. Tapping the line opens the
/// connection details.
struct MacTitle: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 1) {
            MacSwitcherMenu()
            Button {
                model.link.sheetOpen = true
            } label: {
                LinkStatusLabel(line: model.link.statusLine, detail: detail)
            }
            .buttonStyle(.plain)
            .disabled(model.demoMode)
            .accessibilityHint("Shows how this iPhone reaches the Mac")
        }
    }

    private var detail: String? {
        let waiting = model.link.waitingCount
        if waiting > 0 && !model.link.isReady {
            return waiting == 1 ? "1 action waiting" : "\(waiting) actions waiting"
        }
        return model.link.statusLine.tone == .problem ? "tap for details" : nil
    }
}

/// A status dot and the status words, pulsing while connecting.
struct LinkStatusLabel: View {
    let line: LinkStatusLine
    var detail: String? = nil

    private var tint: Color {
        switch line.tone {
        case .live: return .green
        case .waiting: return .orange
        case .problem: return .red
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "circle.fill")
                .font(.system(size: 6))
                .foregroundStyle(tint)
                .symbolEffect(.pulse, isActive: line.text.hasSuffix("…"))
            Text(detail.map { "\(line.text) · \($0)" } ?? line.text)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

private struct ConnectionSubtitle: ViewModifier {
    @Environment(AppModel.self) private var model
    let title: String
    let otherwise: String?

    /// While connected the screen keeps its own subtitle; otherwise the
    /// connection's status takes its place.
    private var subtitle: String? {
        if model.demoMode || model.link.isReady { return otherwise }
        return model.link.statusLine.text
    }

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *), let subtitle {
            content
                .navigationTitle(title)
                .navigationSubtitle(subtitle)
        } else if #available(iOS 26.0, *) {
            content.navigationTitle(title)
        } else if model.demoMode || model.link.isReady {
            content.navigationTitle(title)
        } else {
            content
                .navigationTitle(title)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 1) {
                            Text(title).font(.headline).lineLimit(1)
                            LinkStatusLabel(line: model.link.statusLine)
                        }
                    }
                }
        }
    }
}

extension View {
    /// A pushed screen's title, with the connection's status under it whenever
    /// the Mac isn't connected.
    func connectionTitle(_ title: String, otherwise subtitle: String? = nil) -> some View {
        modifier(ConnectionSubtitle(title: title, otherwise: subtitle))
    }
}
