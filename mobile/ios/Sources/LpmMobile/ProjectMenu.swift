import SwiftUI
import UIKit

/// The project's control menu in the nav bar: a single "more" button whose native
/// menu holds Start/Stop and (when present) profiles. Actions have their own bolt
/// button beside it; per-service display and toggles live in the list's Services
/// section.
struct ProjectRunControl: View {
    @Environment(AppModel.self) private var model
    let project: Project
    let pending: Bool
    let changedCount: Int?
    let onStart: (_ profile: String) -> Void
    let onStop: () -> Void
    let onReviewChanges: () -> Void
    // nil hides the item: the Mac can't answer it, or the project is on SSH.
    let onFiles: (() -> Void)?
    let onResumeSession: (() -> Void)?
    let onMemory: () -> Void
    // nil hides Commands: the Mac doesn't keep lpm commands.
    let onCommands: (() -> Void)?
    let onNotes: () -> Void
    let onAutomations: () -> Void
    let onSwitchBranch: () -> Void
    let onCreatePr: () -> Void
    // nil hides History: the Mac can't answer it, or the project is on SSH.
    let onHistory: (() -> Void)?
    let onAuto: (_ kind: GitAutoKind) -> Void
    let onDiscard: () -> Void
    let onChecks: () -> Void
    /// Find in the terminal this menu sits over; nil leaves the row out.
    let onFind: (() -> Void)?
    // On a terminal's screen Rename names that tab, not the project.
    let renamesTab: Bool
    let onRename: () -> Void
    let onTerminalSettings: () -> Void
    let onConfigure: () -> Void
    // The status waiting on its line; the host presents the prompt.
    @Binding var noteFor: WorkStatusChoice?
    // Accounts waiting on "only mine" before joining a list; the host asks.
    @Binding var claudeConsent: ClaudeConsentRequest?

    private var running: Bool { project.running }

    private var name: String { project.name }
    private var pulling: Bool { model.git.pulling.contains(name) }
    private var pushing: Bool { model.git.pushing.contains(name) }
    private var fetching: Bool { model.git.fetching.contains(name) }
    private var branch: String { model.git.snapshots[name]?.branch ?? "" }
    private var ghCli: Bool { model.git.snapshots[name]?.ghCli ?? false }
    private var autoRun: GitAutoRun? { model.gitAuto.runs[name] }
    private var checks: GitChecks? { model.gitChecks.available ? model.gitChecks.checks(name) : nil }
    private var unreadAutomations: Int {
        model.automations.filter { $0.unread > 0 && $0.runTargets.contains(name) }.count
    }

    var body: some View {
        Menu {
            if let onFind {
                Button(action: onFind) { Label("Find in Terminal", systemImage: "magnifyingglass") }
                Divider()
            }
            // A YAML the Mac can't read has nothing to start, as on the desktop.
            if running || project.configError == nil {
                Button {
                    running ? onStop() : onStart(project.activeProfile)
                } label: {
                    Label(running ? "Stop" : "Start",
                          systemImage: running ? "stop.fill" : "play.fill")
                }
            }

            Button(action: onReviewChanges) {
                Label("Review Changes", systemImage: "checklist")
                if let changedCount, changedCount > 0 {
                    Text("\(changedCount) changed file\(changedCount == 1 ? "" : "s")")
                }
            }

            if let onFiles {
                Button(action: onFiles) {
                    Label("Files", systemImage: "folder")
                }
            }
            if let onResumeSession {
                Button(action: onResumeSession) {
                    Label("Resume Session…", systemImage: "clock.arrow.circlepath")
                }
            }

            gitMenu

            if let checks, let verdict = checks.verdict {
                Button(action: onChecks) {
                    Label { Text("CI") } icon: { verdict.menuIcon }
                    Text(checks.label)
                }
            }

            // Memory is Mac-local: an SSH project's agents run on the other host,
            // where this Mac's session files mean nothing. Notes are stored per
            // project on the Mac either way, so they stay available.
            if !project.isRemote {
                Button(action: onMemory) {
                    Label("Memory", systemImage: "brain")
                }
            }
            if let onCommands {
                Button(action: onCommands) {
                    Label("Commands", systemImage: "slash.circle")
                }
            }
            Button(action: onNotes) {
                Label("Notes", systemImage: "note.text")
            }
            // Jobs run on the Mac in the project's own folder, so, as on the
            // desktop, an SSH project has none.
            if !project.isRemote {
                Button(action: onAutomations) {
                    Label("Automations", systemImage: "clock.arrow.circlepath")
                    if unreadAutomations > 0 {
                        Text("\(unreadAutomations) with new runs")
                    }
                }
                // An SSH project's agents run on the other host under its own login.
                ClaudeAccountMenu(project: project, consentFor: $claudeConsent)
            }
            if project.canHaveWorkStatus {
                WorkStatusMenu(project: project, noteFor: $noteFor)
            }

            if !project.profiles.isEmpty {
                Section("Profiles") {
                    ForEach(project.profiles) { p in
                        Button { onStart(p.name) } label: { profileLabel(p) }
                    }
                }
            }

            Divider()
            Button(action: onRename) {
                Label(renamesTab ? "Rename Tab…" : "Rename…", systemImage: "pencil")
            }
            Button(action: onConfigure) {
                Label("Configure…", systemImage: "slider.horizontal.3")
            }
            Button(action: onTerminalSettings) {
                Label("Terminal Settings", systemImage: "textformat.size")
            }
        } label: {
            if pending {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "ellipsis")
                    .foregroundStyle(running ? .green : .primary)
            }
        }
    }

    /// The desktop's project Git submenu, adapted to mobile: sync ops that fire
    /// directly (disabled while in flight), then branch/PR navigation, then
    /// copy-branch and the destructive discard. Review Changes sits on the main
    /// menu, one level up.
    private var gitMenu: some View {
        Menu {
            Button { model.git.pull(name) } label: { Label("Pull", systemImage: "arrow.down") }
                .disabled(pulling)
            Button {
                AppLock.shared.confirm("Push \(name)") { model.git.push(name) }
            } label: { Label("Push", systemImage: "arrow.up") }
                .disabled(pushing)
            Button { model.git.fetch(name) } label: { Label("Fetch", systemImage: "arrow.triangle.2.circlepath") }
                .disabled(fetching)
            AutoPullMenuItems(project: project)

            Divider()

            Button(action: onSwitchBranch) {
                Label("Switch Branch…", systemImage: "arrow.trianglehead.branch")
            }
            if ghCli {
                Button(action: onCreatePr) {
                    Label("Create Pull Request…", systemImage: "arrow.triangle.pull")
                }
            }
            if let onHistory {
                Button(action: onHistory) {
                    Label("History", systemImage: "clock")
                }
            }

            Divider()

            autoButton(.commit)
            autoButton(.commitPush)
            if ghCli {
                autoButton(.pr)
            }

            Divider()

            Button { UIPasteboard.general.string = branch } label: {
                Label("Copy Branch Name", systemImage: "doc.on.doc")
            }
            .disabled(branch.isEmpty)
            Button(role: .destructive, action: onDiscard) {
                Label("Discard All Changes…", systemImage: "trash")
            }
            .disabled((changedCount ?? 0) == 0)
        } label: {
            Label("Git", systemImage: "arrow.trianglehead.branch")
        }
    }

    /// While a run is going every item reopens its progress sheet, so the one
    /// in flight reads as such; otherwise the commit items need changes to
    /// commit (Auto Create PR can still ship commits already made).
    private func autoButton(_ kind: GitAutoKind) -> some View {
        let running = autoRun?.running == true
        let inFlight = running && autoRun?.kind == kind
        return Button { onAuto(kind) } label: {
            Label(kind.title, systemImage: "sparkles")
            Text(inFlight ? "Running… tap to view" : kind.subtitle)
        }
        .disabled(!running && kind != .pr && (changedCount ?? 0) == 0)
    }

    @ViewBuilder
    private func profileLabel(_ p: Profile) -> some View {
        if running && project.activeProfile == p.name {
            Label(p.name, systemImage: "checkmark")
        } else {
            Text(p.name)
        }
    }

}
