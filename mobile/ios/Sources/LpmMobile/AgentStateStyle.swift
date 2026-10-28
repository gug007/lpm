import SwiftUI

extension View {
    /// Colors a tab's name, or a state's word, by what its agent is doing, as the
    /// desktop does: a sweep through the working colors, an orange pulse while it
    /// needs you, red for a problem, blue once done. Idle leaves the style alone.
    @ViewBuilder
    func agentTone(_ state: AgentState?) -> some View {
        switch state {
        case .working: modifier(WorkingSweep())
        case .needsYou: foregroundStyle(AgentState.needsYou.tint).modifier(AgentPulse())
        case .error, .done: foregroundStyle(state?.tint ?? .primary)
        case .idle, nil: self
        }
    }

    /// `agentTone`, or gray once the agent has been seen: a seen row keeps its
    /// mark, so a finished turn still reads apart from a failed one.
    @ViewBuilder
    func agentTone(_ state: AgentState?, seen: Bool) -> some View {
        if seen {
            foregroundStyle(.secondary)
        } else {
            agentTone(state)
        }
    }
}

/// The desktop's working shimmer: its five colors scroll through the view twice
/// every four seconds, easing in and out, under a slow glow. A strip of the
/// gradient slides under the text as a looping animation, rather than the text
/// being rebuilt every frame.
private struct WorkingSweep: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content.foregroundStyle(AgentSweep.still)
        } else {
            content
                .foregroundStyle(.clear)
                .overlay(alignment: .leading) {
                    GeometryReader { geo in
                        LinearGradient(colors: AgentSweep.strip, startPoint: .leading, endPoint: .trailing)
                            .frame(width: geo.size.width * 9)
                            // Bezier (1/3, 0, 2/3, 1) is exactly smoothstep, the
                            // desktop's ease. The jump back is a no-op: two laps
                            // on, the strip looks as it did at the start.
                            .phaseAnimator([false, true]) { strip, swept in
                                strip.modifier(StripSlide(progress: swept ? 1 : 0))
                            } animation: { swept in
                                swept ? .timingCurve(1 / 3, 0, 2 / 3, 1, duration: 4) : nil
                            }
                            .phaseAnimator([false, true]) { strip, glowing in
                                strip.brightness(glowing ? 0.12 : 0)
                            } animation: { _ in .easeInOut(duration: 1) }
                    }
                    .mask { content }
                }
        }
    }
}

/// Slides the gradient strip two laps — two thirds of its width — as `progress`
/// runs from 0 to 1.
private struct StripSlide: GeometryEffect {
    var progress: CGFloat

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: -progress * size.width * 2 / 3, y: 0))
    }
}

/// The desktop's "needs you" pulse: down to half strength and back every two seconds.
private struct AgentPulse: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.phaseAnimator([false, true]) { view, dimmed in
                view.opacity(dimmed ? 0.5 : 1)
            } animation: { _ in .easeInOut(duration: 1) }
        }
    }
}

/// The mark a tab's row ends with: a bell while the agent waits on you, an alert
/// for a problem, a check once the turn lands. Working and idle say so through
/// the name alone, and their slot keeps its width so the clocks line up.
struct AgentStateMark: View {
    let state: AgentState
    var seen = false

    var body: some View {
        switch state {
        case .needsYou: symbol("bell.fill").agentTone(state, seen: seen)
        case .error: symbol("exclamationmark.circle.fill").agentTone(state, seen: seen)
        case .done: symbol("checkmark").agentTone(state, seen: seen)
        case .working, .idle: symbol("checkmark").hidden()
        }
    }

    private func symbol(_ name: String) -> some View {
        Image(systemName: name)
            .fontWeight(.semibold)
            .frame(width: 18)
    }
}

/// The end of a tab's row, as the desktop sidebar ends one: the state's mark,
/// then how long the agent has been at it, or how long the finished turn took.
struct AgentStatusTrail: View {
    let agent: ProjectAgentRow

    var body: some View {
        HStack(spacing: 4) {
            AgentStateMark(state: agent.state, seen: agent.seen)
            if let since = agent.since {
                ElapsedText(since: since, until: agent.until)
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
    }
}
