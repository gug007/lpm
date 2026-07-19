import Foundation

/// A generation-guarded one-shot timeout keyed by an arbitrary token. Each `arm`
/// bumps the key's generation and schedules `fire` after `seconds`; the closure
/// runs only if no newer `arm` or `cancel` for that key intervened. `cancel` just
/// bumps the generation, so an in-flight timeout is invalidated without firing.
///
/// This replaces the hand-rolled "bump a counter → DispatchQueue.asyncAfter →
/// guard the counter is unchanged" idiom that was duplicated across the model.
@MainActor
final class GenerationTimeout<Key: Hashable> {
    private var generation: [Key: Int] = [:]

    func arm(_ key: Key, seconds: Double, _ fire: @escaping () -> Void) {
        let gen = (generation[key] ?? 0) + 1
        generation[key] = gen
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self, self.generation[key] == gen else { return }
            fire()
        }
    }

    func cancel(_ key: Key) {
        generation[key] = (generation[key] ?? 0) + 1
    }

    /// Drop every key's generation, so any in-flight timeout is invalidated. Used
    /// on a session reset where all pending work is abandoned at once.
    func cancelAll() {
        generation.removeAll()
    }
}
