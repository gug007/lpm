import SwiftUI

/// Progress and result of an Auto Commit / Auto Commit and Push / Auto Create PR
/// run. The Mac owns the run, so closing the sheet leaves it going; Stop cancels
/// it. Mirrors the desktop's AutoPRModal (step list, then the created PR with
/// Open and "Switch to <base> and pull").
struct GitAutoSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: Project

    private var name: String { project.name }
    private var run: GitAutoRun? { model.gitAuto.runs[name] }
    private var switching: Bool { model.gitAuto.switching.contains(name) }

    var body: some View {
        NavigationStack {
            List {
                if let run {
                    if run.phase == .done { doneSection(run) }
                    Section {
                        ForEach(run.steps) { GitAutoStepRow(step: $0) }
                    } footer: {
                        if run.phase == .running || run.phase == .canceled {
                            Text(run.phase == .canceled ? "Canceled." : run.kind.subtitle)
                        }
                    }
                    if run.phase == .failed { failedSection(run) }
                }
            }
            .navigationTitle(run?.kind.title ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(run?.running == true ? "Close" : "Done") { dismiss() }
                        .disabled(switching)
                }
                ToolbarItem(placement: .confirmationAction) { trailingAction }
            }
            .alert(
                "Couldn't switch branch",
                isPresented: Binding(get: { model.gitAuto.switchError[name] != nil },
                                     set: { if !$0 { model.gitAuto.switchError[name] = nil } })
            ) {
                Button("OK", role: .cancel) { model.gitAuto.switchError[name] = nil }
            } message: {
                Text(model.gitAuto.switchError[name] ?? "")
            }
            .onChange(of: model.gitAuto.switchedTick[name]) { _, _ in dismiss() }
        }
        .presentationDetents([.medium, .large])
        .onAppear { model.gitAuto.sheetAppeared(name) }
        .onDisappear { model.gitAuto.sheetDisappeared(name) }
    }

    @ViewBuilder
    private var trailingAction: some View {
        if let run {
            if run.running {
                Button(run.canceling ? "Stopping…" : "Stop", role: .destructive) {
                    model.gitAuto.cancel(name)
                }
                .disabled(run.canceling)
            } else if run.phase == .failed || run.phase == .canceled {
                Button("Retry") { model.gitAuto.start(name, kind: run.kind) }
            }
        }
    }

    @ViewBuilder
    private func doneSection(_ run: GitAutoRun) -> some View {
        Section {
            VStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.green)
                    .symbolEffect(.bounce, value: run.runId)
                Text(doneHeadline(run))
                    .font(.headline)
                    .multilineTextAlignment(.center)
                if run.kind == .pr, !run.branch.isEmpty, !run.base.isEmpty {
                    Text("\(run.branch) → \(run.base)")
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                } else if !run.message.isEmpty {
                    Text(run.message)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            if run.kind == .pr {
                if let link = URL(string: run.url), !run.url.isEmpty {
                    Link(destination: link) {
                        Label("Open on GitHub", systemImage: "safari")
                    }
                    .disabled(switching)
                }
                if !run.base.isEmpty {
                    Button {
                        model.gitAuto.switchToBase(name, base: run.base)
                    } label: {
                        HStack {
                            Label(switching ? "Switching to \(run.base)…" : "Switch to \(run.base) and pull",
                                  systemImage: "arrow.trianglehead.branch")
                            if switching {
                                Spacer()
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                    .disabled(switching)
                }
            }
        }
    }

    @ViewBuilder
    private func failedSection(_ run: GitAutoRun) -> some View {
        Section {
            Label {
                Text(run.error.isEmpty ? "Something went wrong." : run.error)
                    .textSelection(.enabled)
            } icon: {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.red)
            }
            if let link = URL(string: run.url), !run.url.isEmpty {
                Link(destination: link) {
                    Label("Open Pull Request", systemImage: "safari")
                }
            }
        }
    }

    private func doneHeadline(_ run: GitAutoRun) -> String {
        switch run.kind {
        case .commit: "Committed"
        case .commitPush: run.rebased
            ? "Committed, rebased onto new remote commits, and pushed"
            : "Committed and pushed"
        case .pr: "Pull request created"
        }
    }
}

/// One step of a run: status glyph, label, and what it's doing or produced.
private struct GitAutoStepRow: View {
    let step: GitAutoStep

    private var dimmed: Bool { step.status == .pending || step.status == .skipped }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            icon
                .frame(width: 20, height: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(step.label)
                    .foregroundStyle(dimmed ? .secondary : .primary)
                if !step.detail.isEmpty, step.status != .failed {
                    Text(step.detail)
                        .font(step.status == .done ? .footnote.monospaced() : .footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .truncationMode(.middle)
                }
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var icon: some View {
        switch step.status {
        case .running:
            ProgressView().controlSize(.small)
        case .done:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        case .skipped:
            Image(systemName: "minus.circle").foregroundStyle(.tertiary)
        case .pending:
            Image(systemName: "circle").foregroundStyle(.tertiary)
        }
    }
}
