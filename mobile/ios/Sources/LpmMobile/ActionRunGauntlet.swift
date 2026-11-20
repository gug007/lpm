import SwiftUI

/// What the desktop asks for before it runs an action: its inputs (if any), then
/// its confirmation (if flagged). `begin` starts it on a view that presents it
/// with `actionRunGauntlet`.
struct ActionRunGauntlet {
    fileprivate var inputsFor: Action?
    fileprivate var initial: [String: String] = [:]
    fileprivate var confirming: Confirming?

    fileprivate struct Confirming {
        let action: Action
        let values: [String: String]
    }

    /// Asks for the action's inputs or confirmation; false when it needs neither
    /// and runs now.
    mutating func begin(_ action: Action) -> Bool {
        begin(action, given: [:]) == nil
    }

    /// Asks for the inputs `given` leaves out, starting from those it fills (a
    /// page's `lpm.run`), then the confirmation; the values to run with now when
    /// it asks for nothing.
    mutating func begin(_ action: Action, given: [String: String]) -> [String: String]? {
        let filled = action.pageInputs(given)
        if !filled.complete {
            initial = filled.values
            inputsFor = action
        } else if action.confirm {
            confirming = Confirming(action: action, values: filled.values)
        } else {
            return filled.values
        }
        return nil
    }
}

extension View {
    /// Presents what `gauntlet` asks for, then hands `onRun` the action and its
    /// input values, as the sheet or alert that asked goes away; `onCancel` when
    /// it's turned down instead.
    func actionRunGauntlet(_ gauntlet: Binding<ActionRunGauntlet>,
                           onCancel: (() -> Void)? = nil,
                           onRun: @escaping (Action, [String: String]) -> Void) -> some View {
        modifier(ActionRunGauntletHost(gauntlet: gauntlet, onRun: onRun, onCancel: onCancel))
    }
}

private struct ActionRunGauntletHost: ViewModifier {
    @Binding var gauntlet: ActionRunGauntlet
    let onRun: (Action, [String: String]) -> Void
    let onCancel: (() -> Void)?
    @State private var submitted = false

    func body(content: Content) -> some View {
        content
            .sheet(item: $gauntlet.inputsFor, onDismiss: {
                if !submitted { onCancel?() }
                submitted = false
            }) { action in
                ActionInputsSheet(action: action, initial: gauntlet.initial) { values in
                    submitted = true
                    afterInputs(action, values)
                }
            }
            .alert(
                gauntlet.confirming.map { "Run \($0.action.label)?" } ?? "Run action?",
                isPresented: Binding(
                    get: { gauntlet.confirming != nil },
                    set: { if !$0 { gauntlet.confirming = nil } }
                ),
                presenting: gauntlet.confirming
            ) { confirming in
                Button("Run") { onRun(confirming.action, confirming.values) }
                Button("Cancel", role: .cancel) { onCancel?() }
            }
    }

    private func afterInputs(_ action: Action, _ values: [String: String]) {
        guard action.confirm else { return onRun(action, values) }
        // The inputs sheet is dismissing in this same update; presenting the
        // alert now can be swallowed (one presentation at a time), so let the
        // sheet settle first.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            gauntlet.confirming = .init(action: action, values: values)
        }
    }
}
