import SwiftUI

/// The CI sheet's Keep fixing until green: a switch that makes the next Fix with …
/// row follow its agent until the checks pass, and while a loop runs, its round,
/// where it stands and a Stop button, as the desktop's checks menu shows it.
struct CiFixLoopSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    /// Something fails that a Fix with … row can fix.
    let canFix: Bool
    @Binding var keepFixing: Bool

    private var loop: CiFixLoop? { model.gitChecks.loops[project] }
    private var running: CiFixLoop? { loop.flatMap { $0.running ? $0 : nil } }
    /// How the last loop ended, said once it's over.
    private var ended: CiFixLoop? { loop.flatMap { !$0.running && $0.state != "cancelled" ? $0 : nil } }

    var body: some View {
        if running != nil || canFix {
            controls
        } else if let ended {
            Section {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Keep fixing until green")
                        Text(ended.detail).font(.footnote).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: ended.state == "passed" ? "checkmark.circle.fill" : "exclamationmark.circle")
                        .foregroundStyle(ended.state == "passed" ? .green : .orange)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var controls: some View {
        Section {
            Toggle(isOn: Binding(
                get: { running != nil || keepFixing },
                set: { on in
                    if !on, running != nil {
                        Haptics.tap()
                        model.gitChecks.stopLoop(project)
                    }
                    keepFixing = on
                }
            )) {
                Label {
                    Text("Keep fixing until green")
                } icon: {
                    Image(systemName: "repeat").foregroundStyle(.tint)
                }
            }
            if let running {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(running.roundLabel).font(.subheadline.weight(.semibold))
                        Text(running.detail)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                        ProgressView(value: min(max(running.progress, 0), 1))
                            .padding(.top, 3)
                    }
                    .accessibilityElement(children: .combine)
                    Spacer(minLength: 8)
                    Button("Stop") {
                        Haptics.tap()
                        model.gitChecks.stopLoop(project)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.vertical, 2)
            }
        } footer: {
            if let error = model.gitChecks.loopErrors[project] {
                Text(error).foregroundStyle(.red)
            } else if running != nil || keepFixing {
                Text("Each new failure goes to the same tab with the failing checks. Stops when checks pass, after 3 rounds, or when the agent asks you something.")
            } else if let ended, !ended.detail.isEmpty {
                Text(ended.detail)
            }
        }
    }
}
