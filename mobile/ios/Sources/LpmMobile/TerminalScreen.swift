import SwiftUI

/// A single terminal: xterm.js (in a WKWebView) renders output the client streams
/// in and posts keystrokes back — the same emulator the desktop uses, so rendering
/// matches and scrollback works. The nav bar floats translucently over the top.
struct TerminalScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let term: TerminalInfo
    let project: Project
    @StateObject private var keyboard = KeyboardObserver()
    @State private var composerRoom: CGFloat = 0
    @State private var textExtent = TextExtent()
    // Flips when the first screen snapshot renders, hiding the loading spinner.
    @State private var hasContent = false
    // A terminal spawned by running an action from this screen — pushed on top.
    @State private var switched: TerminalInfo?
    // A file path tapped in the terminal, open in the preview sheet.
    @State private var preview: FilePreviewTarget?
    // Top of the navigation stack, so a touch on a screen pushed over it isn't
    // taken as looking at this terminal.
    @State private var onScreen = false
    // The tab lpm reopened in this one's place after restarting, or ran again
    // when asked to; the screen carries on with it.
    @State private var successor: TerminalInfo?
    @State private var reopened = false
    // The bar's middle, which the title keeps to whatever buttons flank it.
    @State private var barAxis: CGFloat?
    @State private var find = TerminalFind()
    // Phone-local terminal preferences (Settings → Terminal).
    @AppStorage(TerminalPrefs.fontSizeKey) private var fontSize = TerminalPrefs.defaultFontSize
    @AppStorage(TerminalPrefs.themeKey) private var themeRaw = TerminalPrefs.defaultTheme.rawValue

    private var theme: TerminalTheme { TerminalPrefs.theme(themeRaw) }
    private var liveProject: Project { model.projects.first(where: { $0.name == term.project }) ?? project }
    /// The terminal on screen, as the project's list has it now (a rename shows).
    private var current: TerminalInfo {
        let shown = successor ?? term
        return model.terminals[shown.project]?.first { $0.id == shown.id } ?? shown
    }
    /// Still looking for the tab lpm reopened in this one's place.
    private var awaitingReopen: Bool {
        guard model.endedTerminals[current.id]?.replaceable == true else { return false }
        return model.demoMode || model.link.isReady
    }

    var body: some View {
        // A terminal is shown live in exactly one place at a time. When the
        // desktop (or another phone) owns it, show a "take control" placeholder
        // instead of a second, mis-sized copy — but keep the web view MOUNTED
        // underneath so this phone stays subscribed (a presenter / candidate
        // owner) and takes over instantly on claim.
        let term = current
        let controlled = model.isControlled(term.id)
        let ended = model.endedTerminals[term.id]
        let restored = model.movedTab(for: term) ?? model.restoredTab(for: term)
        let accountMove = model.accountMove(for: term)
        // The Mac still has the tab, so it can be run again or closed from here.
        let listed = model.terminals[term.project]?.contains { $0.id == term.id } == true
        let endedHere = ended.flatMap { !$0.restarted && listed && accountMove == nil ? $0 : nil }
        // The terminal sits WITHIN the safe area (below the nav bar), so its top
        // rows aren't hidden under the title; the composer sits below it and rides
        // above the keyboard when it opens.
        return VStack(spacing: 0) {
            ZStack {
                // Resizing the web view every keyboard frame reflowed xterm and sent
                // the Mac a PTY resize each time; it slides instead and refits once.
                KeyboardSteadyFrame(keyboard: keyboard, extent: textExtent) { hidden in
                    WebTerminalView(term: term, onFirstContent: {
                        withAnimation(.easeOut(duration: 0.2)) { hasContent = true }
                    }, hiddenInsets: hidden, textExtent: textExtent, fontSize: fontSize, theme: theme, onOpenPath: { paths, line in
                        Haptics.tap()
                        preview = FilePreviewTarget(project: term.project, paths: paths, line: line)
                    }, find: find)
                        .environment(model)
                        .id(term.id)
                }
                if controlled && !hasContent && ended == nil {
                    TerminalLoadingView(background: theme.backgroundColor)
                }
                if !controlled && ended == nil {
                    ControlHandoffView(ownerLabel: model.controlOwnerLabel(term.id),
                                       background: theme.backgroundColor) {
                        model.claimControl(term.id)
                    }
                }
                // Without this the terminal just freezes silently while the link
                // is down — keystrokes and scroll are live traffic, dropped by
                // design, so the user needs to see WHY nothing responds.
                if model.connection != .ready {
                    TerminalConnectionBanner()
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                } else if let ended, endedHere == nil {
                    TerminalEndedBanner(text: ended.message)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                } else if reopened {
                    TerminalEndedBanner(text: "Reopened after lpm restarted", icon: "arrow.clockwise")
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
                if let accountMove {
                    TerminalAccountMoveView(account: accountMove, background: theme.backgroundColor)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .top) {
                if find.isOpen {
                    TerminalFindBar(find: find)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: find.isOpen)
            .animation(.easeOut(duration: 0.2), value: model.connection == .ready)
            .animation(.easeOut(duration: 0.2), value: ended)
            .animation(.easeOut(duration: 0.2), value: reopened)
            .animation(.easeOut(duration: 0.2), value: accountMove)
            if ended == nil, accountMove == nil, let stop = model.limitStop(for: term) {
                TerminalLimitStopBar(term: term, stop: stop)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if controlled && ended == nil {
                TerminalComposer(store: model.composerStore(for: term.id, project: term.project, label: term.label),
                                 terminalBackground: theme.backgroundColor,
                                 fullHeight: composerRoom)
                    .environment(model)
                    .id(term.id)
            } else if let endedHere {
                TerminalEndedBar(label: term.label, ending: endedHere, background: theme.backgroundColor,
                                 onRestart: model.canRestartTerminals ? { model.restartTerminal(term) } : nil,
                                 onClose: {
                                     model.closeTerminal(term.project, id: term.id)
                                     dismiss()
                                 })
            }
        }
            .background(theme.backgroundColor.ignoresSafeArea(.all, edges: .all))
            // The space on offer, not what's in it: a composer taller than the screen
            // after rotating would otherwise keep reading as the room it needs.
            .frame(minHeight: 0, maxHeight: .infinity)
            .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { composerRoom = $0 }
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).midX } action: { barAxis = $0 }
            .navigationTitle(term.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { TerminalTitle(term: term, axis: barAxis) }
            }
            .followsGitChanges(term.project)
            .projectMenuToolbar(project: liveProject, terminal: term,
                                onFind: controlled && ended == nil ? { find.open() } : nil,
                                onSpawnedTerminal: { t in
                // The new terminal is owned by the desktop that opened it; claim it
                // for this phone before pushing so the pushed screen renders live
                // instead of a "take control" placeholder.
                model.claimControl(t.id)
                switched = t
            })
            .navigationDestination(item: $switched) { TerminalScreen(term: $0, project: liveProject) }
            .sheet(item: $preview) { FilePreviewSheet(target: $0).environment(model) }
            // Opening the terminal is the tap that sees it; a finish that lands while
            // it is already open waits for the next touch, as on the desktop.
            .background(WindowTouchObserver {
                if onScreen { model.markTerminalSeen(project: term.project, paneId: term.id) }
            })
            .onAppear {
                onScreen = true
                model.markTerminalSeen(project: term.project, paneId: term.id)
            }
            .onDisappear { onScreen = false }
            .onChange(of: restored) { _, next in
                if let next { follow(next) }
            }
            // lpm restores a project's tabs as it starts up, so its list can
            // take a while to hold the one standing in for this.
            .task(id: awaitingReopen) {
                guard awaitingReopen else { return }
                let id = current.id
                for _ in 0..<10 {
                    model.loadTerminals(term.project)
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    if Task.isCancelled { return }
                }
                model.restartLapsed(id)
            }
            .task(id: reopened) {
                guard reopened else { return }
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if !Task.isCancelled { reopened = false }
            }
            // Fallback: never leave the spinner up if no snapshot ever arrives
            // (e.g. the link drops mid-open).
            .task(id: term.id) {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                withAnimation { hasContent = true }
            }
            // Solid bar matching the terminal ground, scoped to this screen — the
            // terminal sits below it (safe area), so the bar reads as one continuous
            // surface with the terminal instead of letting the light background show
            // through. `.dark` keeps title/back white (every theme has a dark bg).
            .toolbarBackground(theme.backgroundColor, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }

    /// Carry on with the tab lpm reopened: what was typed here goes with it, and
    /// so does control if this phone had it. A restart asked for here needs no
    /// word that it happened.
    private func follow(_ next: TerminalInfo) {
        let old = current
        // Run again or moved to another account on request, rather than reopened
        // by lpm starting up.
        let replacedHere = model.endedTerminals[old.id]?.restarting == true || next.switchedFrom == old.id
        if model.isControlled(old.id) { model.claimControl(next.id) }
        model.carryComposerDraft(from: old.id, to: next)
        hasContent = false
        successor = next
        reopened = !replacedHere
    }
}
