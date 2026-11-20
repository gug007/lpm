import SwiftUI

/// Runs what the page in a popup or app sheet asks for (`lpm.run`) as a tap on
/// the action's button would: the inputs the page didn't give, the confirmation,
/// then the run — a background run's output in its sheet and back to the page
/// once it ends, a terminal run on the Mac. The page runs one action at a time.
struct ActionPageRunHost: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    /// A run that opened a terminal: the sheet goes and the terminal shows, as
    /// the desktop switches to its tab.
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    @State private var gauntlet = ActionRunGauntlet()
    @State private var backgroundRun: BackgroundRunInfo?
    @State private var app: Action?
    @State private var waiting = Waiting()

    func body(content: Content) -> some View {
        content
            .environment(\.actionPageRun, start)
            .actionRunGauntlet($gauntlet, onCancel: { waiting.settle(.init(canceled: true)) }) { action, values in
                dispatch(action, values, deferred: true)
            }
            .sheet(item: $backgroundRun) { run in
                BackgroundRunSheet(run: run).environment(model)
            }
            .sheet(item: $app) { action in
                ActionAppScreen(project: project, action: action, onSpawnedTerminal: onSpawnedTerminal)
                    .environment(model)
            }
            .onDisappear { waiting.drop() }
    }

    private func start(id: String, name: String, inputs: [String: String],
                       reply: @escaping (ActionPageRunResult) -> Void) {
        guard !waiting.busy else {
            return reply(.init(error: "This page's last run hasn't finished."))
        }
        let actions = model.projects.first { $0.name == project }?.actions ?? []
        guard let action = actions.pageAction(named: name) else {
            return reply(.init(error: "There's no action \"\(name)\" in this project."))
        }
        waiting.reply = reply
        if let values = gauntlet.begin(action, given: inputs) {
            dispatch(action, values, deferred: false)
        }
    }

    private func dispatch(_ action: Action, _ values: [String: String], deferred: Bool) {
        // A sheet or alert that asked is going away: SwiftUI can't present the
        // next sheet until it's gone.
        let present = { (show: @escaping () -> Void) in
            if deferred { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: show) } else { show() }
        }
        if model.actionPopups.opensApp(action) {
            waiting.settle(.init(ok: true))
            present { app = action }
        } else if action.runsInBackground {
            let runId = model.startBackgroundAction(project: project, action: action.name,
                                                    label: action.label, inputValues: values)
            present { backgroundRun = model.backgroundRunInfo[runId] }
            waiting.watch(runId, project: project, model: model)
        } else {
            waiting.settle(.init(ok: true))
            let open = onSpawnedTerminal.map { open in { (terminal: TerminalInfo) in
                dismiss()
                open(terminal)
            } }
            model.runAction(project, action: action.name, inputValues: values, confirmed: true, onSpawn: open)
        }
    }

    /// The page's run in flight, and the background run it waits on.
    @MainActor
    final class Waiting {
        var reply: ((ActionPageRunResult) -> Void)?
        private var watcher: Task<Void, Never>?

        var busy: Bool { reply != nil }

        func settle(_ result: ActionPageRunResult) {
            watcher?.cancel()
            watcher = nil
            let reply = self.reply
            self.reply = nil
            reply?(result)
        }

        /// The sheet closed: its page heard nothing more.
        func drop() {
            watcher?.cancel()
            watcher = nil
            reply = nil
        }

        func watch(_ runId: String, project: String, model: AppModel) {
            watcher = Task { [weak self] in
                while !Task.isCancelled {
                    model.loadBackgroundRunOutput(project: project, runId: runId)
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    guard let self, !Task.isCancelled else { return }
                    if let error = model.backgroundRunErrors[runId] {
                        return self.settle(.init(error: error))
                    }
                    if let run = model.backgroundRuns[runId], !run.running {
                        let output = ActionPageRunResult.output(run.text)
                        if run.success { return self.settle(.init(ok: true, output: output)) }
                        let canceled = run.error == "cancelled"
                        return self.settle(.init(output: output, error: canceled ? "" : run.error, canceled: canceled))
                    }
                    if model.backgroundRunInfo[runId] == nil {
                        return self.settle(.init(error: "The Mac no longer has this run."))
                    }
                }
            }
        }
    }
}

extension View {
    /// Runs what a page in this sheet asks for (see ActionPageRunHost).
    func actionPageRuns(project: String, onSpawnedTerminal: ((TerminalInfo) -> Void)?) -> some View {
        modifier(ActionPageRunHost(project: project, onSpawnedTerminal: onSpawnedTerminal))
    }
}
