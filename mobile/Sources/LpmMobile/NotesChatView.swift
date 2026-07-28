import SwiftUI
import UIKit

/// One notebook chat as a bottom-anchored transcript, with day separators and the
/// composer pinned below. Pushed from `NotesScreen`, so it only sets an inline
/// title.
///
/// The wire delivers notes newest-first in pages; the transcript reads oldest-first
/// and pages backwards as the user scrolls to the top, stopping when the store says
/// the history is exhausted.
struct NotesChatView: View {
    @Environment(AppModel.self) private var model

    let project: String
    let chatId: String
    let title: String

    @State private var editing: NoteMessage?
    @State private var deleting: NoteMessage?
    // The oldest note held when an older page was asked for, so the transcript can
    // land back on it instead of jumping once the page prepends.
    @State private var anchorId: String?
    // The first page lands at the bottom, and a LazyVStack realises its topmost row
    // while doing so — which would read as "the user scrolled to the top" and pull
    // an older page the moment the thread opens. Paging waits for this.
    @State private var landed = false

    private var notes: NotesStore { model.notes }
    private var chatKey: String { notes.key(project, chatId) }
    private var items: [NoteMessage] { notes.orderedMessages(project, chatId: chatId) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    topSentinel
                    ForEach(dayGroups) { group in
                        daySeparator(group.label)
                        ForEach(group.messages) { message in
                            row(message).id(message.id)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            // Deliberately not `.defaultScrollAnchor(.bottom)`: that anchor resolves
            // against the content present at first layout, which for a thread whose
            // first page is still in flight is nothing — once the page lands the
            // whole transcript sits scrolled out of view. Anchoring explicitly once
            // there is something to anchor to is the only reliable order.
            .onChange(of: items.count) { _, _ in settleScroll(proxy) }
            .onAppear { settleScroll(proxy) }
        }
        .overlay { emptyState }
        .safeAreaInset(edge: .top, spacing: 0) { errorBanner }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            NotesComposer(project: project, chatId: chatId)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            notes.loadMessages(project, chatId: chatId)
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        .task {
            // The list's onDisappear fires when this view is pushed, so re-mark the
            // project active — a reconnect replays whatever is on screen.
            notes.screenDidOpen(project)
            notes.chatDidOpen(project, chatId: chatId)
        }
        .onDisappear { notes.chatDidClose(project, chatId: chatId) }
        .sheet(item: $editing) { message in
            NoteEditSheet(text: message.text) { updated in
                notes.editNote(project, id: message.id, text: updated)
            }
        }
        .confirmationDialog("Delete note?", isPresented: Binding(
            get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { message in
            Button("Delete", role: .destructive) {
                Haptics.warning()
                notes.deleteNote(project, id: message.id)
                deleting = nil
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: { _ in
            Text("This note and its attachments will be removed. This can't be undone.")
        }
    }

    // MARK: pieces

    @ViewBuilder private var topSentinel: some View {
        if notes.canLoadMore(project, chatId: chatId) {
            HStack {
                Spacer()
                ProgressView()
                Spacer()
            }
            .padding(.vertical, 6)
            .onAppear {
                guard landed else { return }
                anchorId = items.first?.id
                notes.loadMoreMessages(project, chatId: chatId)
            }
        }
    }

    private func daySeparator(_ label: String) -> some View {
        HStack {
            Spacer()
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color(.secondarySystemBackground))
                .clipShape(Capsule())
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private func row(_ message: NoteMessage) -> some View {
        NotesMessageRow(
            project: project,
            message: message,
            timeText: Self.clockTime(message.ts),
            busy: notes.noteMutating.contains(notes.key(project, message.id)),
            onEdit: { editing = message },
            onCopy: {
                UIPasteboard.general.string = message.text
                Haptics.tap()
            },
            onDelete: { deleting = message }
        )
        .equatable()
    }

    @ViewBuilder private var emptyState: some View {
        if !items.isEmpty {
            EmptyView()
        } else if notes.messagesLoading.contains(chatKey) {
            ProgressView()
        } else if notes.messagesError[chatKey] == nil {
            ContentUnavailableView("No notes here yet", systemImage: "square.and.pencil",
                                   description: Text("Write the first note in this chat below."))
        }
    }

    @ViewBuilder private var errorBanner: some View {
        if let message = currentError {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.circle.fill")
                Text(message).font(.system(size: 13))
                Spacer(minLength: 4)
                Button(action: clearErrors) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.plain)
            }
            .foregroundStyle(.orange)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(.bar)
        }
    }

    // MARK: state

    private var currentError: String? {
        if let message = notes.sendError[chatKey] { return message }
        if let message = notes.messagesError[chatKey] { return message }
        return items.compactMap { notes.noteError[notes.key(project, $0.id)] }.first
    }

    private func clearErrors() {
        notes.sendError[chatKey] = nil
        notes.messagesError[chatKey] = nil
        for message in items { notes.noteError[notes.key(project, message.id)] = nil }
    }

    /// An older page prepends above the viewport, so put the note the user was
    /// reading back under their thumb; anything else that grows the thread — the
    /// first page, a note just written — belongs at the bottom, where a transcript
    /// is read from. Deferred a runloop turn so the rows it names are laid out.
    private func settleScroll(_ proxy: ScrollViewProxy) {
        let target = anchorId ?? items.last?.id
        let edge: UnitPoint = anchorId != nil ? .top : .bottom
        anchorId = nil
        guard let target else { return }
        DispatchQueue.main.async {
            proxy.scrollTo(target, anchor: edge)
            landed = true
        }
    }

    // MARK: grouping

    private struct DayGroup: Identifiable {
        let id: Int
        let label: String
        var messages: [NoteMessage]
    }

    private var dayGroups: [DayGroup] {
        let calendar = Calendar.current
        var groups: [DayGroup] = []
        for message in items {
            let date = Date(timeIntervalSince1970: Double(message.ts) / 1000)
            let day = calendar.startOfDay(for: date)
            let id = Int(day.timeIntervalSince1970)
            if groups.last?.id == id {
                groups[groups.count - 1].messages.append(message)
            } else {
                groups.append(DayGroup(id: id, label: Self.dayLabel(day), messages: [message]))
            }
        }
        return groups
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        f.doesRelativeDateFormatting = true
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()

    private static func dayLabel(_ day: Date) -> String { dayFormatter.string(from: day) }

    /// `millis`, not seconds — every notes timestamp is unix milliseconds.
    private static func clockTime(_ millis: Int) -> String {
        guard millis > 0 else { return "" }
        return timeFormatter.string(from: Date(timeIntervalSince1970: Double(millis) / 1000))
    }
}

/// The edit-a-note sheet: its own NavigationStack with Cancel / Save, per the
/// sheet convention.
private struct NoteEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: String
    private let onSave: (String) -> Void

    init(text: String, onSave: @escaping (String) -> Void) {
        _draft = State(initialValue: text)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            TextEditor(text: $draft)
                .font(.body)
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .navigationTitle("Edit note")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            onSave(draft)
                            dismiss()
                        }
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}
