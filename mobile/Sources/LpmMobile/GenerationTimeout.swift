import Foundation

/// A generation-guarded one-shot timeout keyed by an arbitrary token. Each `arm`
/// takes a ticket and schedules `fire` after `seconds`; the closure runs only if
/// no newer `arm` or `cancel` for that key intervened. `cancel` takes a ticket of
/// its own, so an in-flight timeout is invalidated without firing.
///
/// Tickets come from one instance-wide counter that only ever climbs, never from
/// a per-key count: `cancelAll` forgets the keys, and a per-key count would start
/// over at 1 there and let the next `arm` hand a re-armed key the same number an
/// already-cancelled timer is still holding — which would fire it against the
/// wrong request.
///
/// This replaces the hand-rolled "bump a counter → DispatchQueue.asyncAfter →
/// guard the counter is unchanged" idiom that was duplicated across the model.
@MainActor
final class GenerationTimeout<Key: Hashable> {
    private var generation: [Key: Int] = [:]
    private var lastTicket = 0

    func arm(_ key: Key, seconds: Double, _ fire: @escaping () -> Void) {
        let gen = ticket()
        generation[key] = gen
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self, self.generation[key] == gen else { return }
            fire()
        }
    }

    func cancel(_ key: Key) {
        generation[key] = ticket()
    }

    /// Drop every key's generation, so any in-flight timeout is invalidated. Used
    /// on a session reset where all pending work is abandoned at once.
    func cancelAll() {
        generation.removeAll()
    }

    private func ticket() -> Int {
        lastTicket += 1
        return lastTicket
    }
}
