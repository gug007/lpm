import SwiftUI

/// What the look for secrets found in the commit, each with a way past it, as
/// the desktop's SecretFindingsPanel lists them.
struct SecretFindingsSection: View {
    let findings: [SecretFinding]
    let onLeaveOut: (String) -> Void
    let onIgnore: (SecretFinding) -> Void
    let onDismiss: () -> Void

    private var title: String {
        findings.count == 1 ? "This commit may contain a secret" : "This commit may contain \(findings.count) secrets"
    }

    var body: some View {
        Section {
            ForEach(findings) { finding in
                VStack(alignment: .leading, spacing: 6) {
                    Text(finding.rule).font(.subheadline.weight(.semibold))
                    Text(finding.place)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .truncationMode(.middle)
                    if !finding.masked.isEmpty {
                        Text(finding.masked)
                            .font(.caption.monospaced())
                            .foregroundStyle(.orange)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    HStack(spacing: 8) {
                        Button("Leave File Out") { onLeaveOut(finding.path) }
                        Button(finding.line > 0 ? "Ignore Line" : "Ignore") { onIgnore(finding) }
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .padding(.top, 2)
                }
                .padding(.vertical, 2)
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Label(title, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .textCase(nil)
                Spacer(minLength: 8)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Back to the commit")
            }
        } footer: {
            Text("Found on your Mac in the lines this commit adds. Only the key's kind and last characters are shown.")
        }
    }
}

/// The commit sheet's bottom while findings hold the commit: the flagged files
/// left out and the rest sent as asked, or everything sent anyway.
struct SecretFindingsButtons: View {
    let flagged: Int
    let remaining: Int
    let pushes: Bool
    let leaveOut: () -> Void
    let commitAnyway: () -> Void

    private var leaveOutTitle: String {
        let files = flagged == 1 ? "1 File" : "\(flagged) Files"
        return pushes ? "Leave Out \(files) and Push" : "Leave Out \(files) and Commit"
    }

    var body: some View {
        VStack(spacing: 2) {
            if remaining > 0 {
                Button(action: leaveOut) {
                    Text(leaveOutTitle).fontWeight(.semibold).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            Button(role: .destructive, action: commitAnyway) {
                Text(pushes ? "Commit and Push Anyway" : "Commit Anyway").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderless)
        }
        .bottomBar()
    }
}
