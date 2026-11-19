import SwiftUI

/// A failed check in the CI sheet, opened to say why: the step that failed and
/// the last lines it printed, read on the Mac, with the whole log a tap away.
struct CheckLogRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let project: String
    let check: CiCheck

    private var key: String { model.gitExtras.logKey(project, url: check.url) }
    private var log: CheckLog? { model.gitExtras.checkLogs[key] }
    private var error: String? { model.gitExtras.checkLogErrors[key] }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let log {
                Text("\(log.step) · failed")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(text(log))
                        .font(.caption2.monospaced())
                        .foregroundStyle(.primary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(10)
                }
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityLabel("Log of \(log.step)")
            } else if let error {
                Text(error).font(.caption).foregroundStyle(.secondary)
                Button("Try Again") { model.gitExtras.loadCheckLog(project, url: check.url) }
                    .font(.footnote)
            } else {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Reading the log…").font(.caption).foregroundStyle(.secondary)
                }
            }
            if let url = URL(string: check.url) {
                Button("Show Full Log") { openURL(url) }
                    .font(.footnote)
            }
        }
        .padding(.leading, 28)
        .padding(.vertical, 2)
        .onAppear { if log == nil { model.gitExtras.loadCheckLog(project, url: check.url) } }
    }

    private func text(_ log: CheckLog) -> String {
        (log.more ? "…\n" : "") + log.lines.joined(separator: "\n")
    }
}
