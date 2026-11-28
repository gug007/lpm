import SwiftUI

/// The sheet's first state: one sentence, typed or dictated. A take that ends
/// with words sends them by itself; typed text waits for Make a plan.
struct TalkAskView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var focused: Bool

    private var dictation: DictationStore { model.dictation }
    private var owner: String { TalkStore.dictationOwner }
    private var takeActive: Bool { dictation.isActive(owner) }
    private var stripShown: Bool { takeActive || dictation.failure(owner) != nil }
    private var heardWords: String { dictation.words(owner) }

    var body: some View {
        @Bindable var talk = model.talk
        let fieldHidden = stripShown && (!talk.hasText || !heardWords.isEmpty)
        VStack(alignment: .leading, spacing: 18) {
            Text("What should I do?").font(.title3.weight(.bold))
            VStack(alignment: .leading, spacing: 8) {
                TextField("Say or type what to do", text: $talk.text, axis: .vertical)
                    .lineLimit(3...8)
                    .focused($focused)
                    .frame(height: fieldHidden ? 0 : nil)
                    .opacity(fieldHidden ? 0 : 1)
                if !heardWords.isEmpty {
                    DictationPreview(text: talk.text.addingDictated(heardWords), maxHeight: 132)
                }
                HStack(spacing: 8) {
                    if stripShown {
                        DictationCancelButton(color: .secondary, label: takeActive ? "Cancel dictation" : "Dismiss",
                                              action: { dictation.cancel() })
                        DictationStrip(store: dictation, owner: owner, ink: .primary, onRetry: startDictation)
                            .frame(height: 22)
                    } else {
                        Spacer(minLength: 0)
                    }
                    if takeActive {
                        DictationStopButton(store: dictation, glyph: .white)
                    } else {
                        mic
                    }
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            VStack(spacing: 4) {
                TalkSheetButton("Make a plan", prominent: true) {
                    focused = false
                    talk.makePlan()
                }
                .disabled(!talk.hasText || takeActive)
                TalkSheetButton("Cancel") { talk.close() }
            }
        }
        .onDisappear { dictation.abandon(owner) }
    }

    private var mic: some View {
        Button(action: startDictation) {
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 30))
                .foregroundStyle(.primary)
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dictate")
    }

    private func startDictation() {
        focused = false
        model.talk.dictate()
    }
}
