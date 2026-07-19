import SwiftUI
import UIKit

/// An editable, syntax-highlighted code field. SwiftUI's `TextEditor` can't paint
/// per-token colors and — decisive for code — can't disable smart quotes/dashes,
/// which would silently turn `"` into `"` and `-` into `–` and corrupt the YAML.
/// This wraps `UITextView` so we control both: it paints `DiffHighlighter`'s
/// tokens and turns off every autocorrect/substitution behavior. Emoji and other
/// Unicode still type normally (only the "smart" substitutions are off).
struct CodeEditorTextView: UIViewRepresentable {
    @Binding var text: String
    /// File extension that selects the language spec (default YAML config).
    var ext: String = "yml"

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        tv.font = DiffTypography.codeFont
        tv.autocorrectionType = .no
        tv.autocapitalizationType = .none
        tv.smartQuotesType = .no
        tv.smartDashesType = .no
        tv.smartInsertDeleteType = .no
        tv.spellCheckingType = .no
        tv.backgroundColor = .clear
        tv.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        tv.textContainer.lineFragmentPadding = 0
        tv.alwaysBounceVertical = true
        tv.text = text
        context.coordinator.applyHighlight(to: tv)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        context.coordinator.ext = ext
        // Only react to an external text change (a fresh load, or a layer switch).
        // A change that originated from typing already matches `text`, so this
        // skips it and never fights the caret mid-edit.
        if tv.text != text {
            tv.text = text
            context.coordinator.applyHighlight(to: tv)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        private let parent: CodeEditorTextView
        var ext: String
        init(_ parent: CodeEditorTextView) {
            self.parent = parent
            self.ext = parent.ext
        }

        func textViewDidChange(_ tv: UITextView) {
            parent.text = tv.text
            // Don't reflow while a multi-stage input (emoji/IME) is mid-composition
            // — replacing the text storage would drop the marked text.
            guard tv.markedTextRange == nil else { return }
            applyHighlight(to: tv)
        }

        /// Re-tokenizes the whole document and re-applies attributes, preserving the
        /// caret and scroll position. Config files are small, so a full re-highlight
        /// per keystroke is imperceptible and far simpler than tracking edited ranges.
        func applyHighlight(to tv: UITextView) {
            let selected = tv.selectedRange
            let offset = tv.contentOffset
            tv.textStorage.setAttributedString(DiffHighlighter.attributedDocument(tv.text, ext: ext))
            // Keep the next typed character on the default color, not the last
            // token's.
            tv.typingAttributes = [.font: DiffTypography.codeFont,
                                   .foregroundColor: UIColor.label]
            tv.selectedRange = selected
            tv.contentOffset = offset
        }
    }
}
