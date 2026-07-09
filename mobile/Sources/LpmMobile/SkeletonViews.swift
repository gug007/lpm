import SwiftUI
import UIKit

/// Skeleton placeholders shown while real content loads — native-feeling grey
/// shapes matching the real rows, with a subtle shimmer sweep.
extension View {
    func shimmer() -> some View { modifier(Shimmer()) }
}

private struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -0.6

    func body(content: Content) -> some View {
        content
            .modifier(ShimmerMask(phase: phase))
            .onAppear {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    phase = 1.6
                }
            }
    }
}

/// Animatable opacity-gradient mask whose bright band sweeps left → right.
private struct ShimmerMask: ViewModifier, Animatable {
    var phase: CGFloat
    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    func body(content: Content) -> some View {
        content.mask(
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.45), location: phase - 0.3),
                    .init(color: .black, location: phase),
                    .init(color: .black.opacity(0.45), location: phase + 0.3),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
    }
}

struct SkeletonBar: View {
    var width: CGFloat?
    var height: CGFloat = 14

    var body: some View {
        RoundedRectangle(cornerRadius: height / 2, style: .continuous)
            .fill(Color(.tertiarySystemFill))
            .frame(width: width, height: height)
    }
}

/// Ghost of the projects list, shown until the first projects push arrives.
struct ProjectListSkeleton: View {
    private static let rowWidths: [CGFloat] = [150, 104, 168, 120, 88, 136]

    var body: some View {
        List {
            ForEach(Self.rowWidths.indices, id: \.self) { i in
                HStack {
                    Circle()
                        .fill(Color(.tertiarySystemFill))
                        .frame(width: 8, height: 8)
                    SkeletonBar(width: Self.rowWidths[i])
                    Spacer()
                    if i.isMultiple(of: 3) {
                        SkeletonBar(width: 44, height: 18)
                    }
                }
                .shimmer()
            }
        }
        .scrollDisabled(true)
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}

/// Ghost of a terminal row, shown while the tab list loads or a new terminal
/// is being created on the Mac.
struct TerminalRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color(.tertiarySystemFill))
                .frame(width: 36, height: 36)
            SkeletonBar(width: 132)
            Spacer()
        }
        .padding(.vertical, 4)
        .shimmer()
        .transition(.opacity)
    }
}

/// Black-ground spinner shown over a just-opened terminal until its first
/// screen snapshot renders.
struct TerminalLoadingView: View {
    var body: some View {
        ZStack {
            SwiftUI.Color.black
            VStack(spacing: 12) {
                ProgressView()
                    .tint(.white)
                Text("Loading terminal…")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}
