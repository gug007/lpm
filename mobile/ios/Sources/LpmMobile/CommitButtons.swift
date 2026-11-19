import SwiftUI

/// The commit sheet's bottom: "Commit and Push" across the width, "Commit only"
/// under it. Both wait while either runs, and the one tapped shows its progress.
struct CommitButtons: View {
    enum Busy { case checking, committing, pushing, checkingOnly, committingOnly }

    let busy: Busy?
    let enabled: Bool
    let commitAndPush: () -> Void
    let commitOnly: () -> Void

    private var pushTitle: String {
        switch busy {
        case .checking: "Checking for secrets…"
        case .committing: "Committing…"
        case .pushing: "Pushing…"
        default: "Commit and Push"
        }
    }

    private var onlyTitle: String {
        switch busy {
        case .checkingOnly: "Checking for secrets…"
        case .committingOnly: "Committing…"
        default: "Commit only"
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            Button(action: commitAndPush) {
                HStack(spacing: 8) {
                    if busy == .checking || busy == .committing || busy == .pushing {
                        ProgressView().controlSize(.small).tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                    }
                    Text(pushTitle).fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button(action: commitOnly) {
                HStack(spacing: 8) {
                    if busy == .committingOnly || busy == .checkingOnly {
                        ProgressView().controlSize(.small)
                    }
                    Text(onlyTitle)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderless)
        }
        .disabled(!enabled)
        .bottomBar()
    }
}
