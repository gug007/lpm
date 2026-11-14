import AVKit
import QuickLook
import SwiftUI
import UIKit

/// Video and audio in the system player: scrubbing, full screen, AirPlay, PiP.
struct MediaPlayerView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        // Sound even with the ring switch on silent, like any video player.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        let vc = AVPlayerViewController()
        vc.player = AVPlayer(url: url)
        vc.player?.play()
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {}

    static func dismantleUIViewController(_ vc: AVPlayerViewController, coordinator: ()) {
        vc.player?.pause()
        vc.player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// Images (with pinch zoom), PDFs, office documents — anything Quick Look reads.
struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let ql = QLPreviewController()
        ql.dataSource = context.coordinator
        return ql
    }

    func updateUIViewController(_ ql: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

/// Read-only, selectable, searchable code with the diff view's highlighting,
/// scrolled to `line` and that line marked when the tapped path named one.
struct ReadOnlyCodeView: UIViewRepresentable {
    let text: String
    let ext: String
    var line: Int = 0
    var handle: CodeViewHandle? = nil

    // Highlighting walks every character; past this a plain render stays instant.
    private static let highlightLimit = 300_000

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.backgroundColor = .clear
        tv.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        tv.textContainer.lineFragmentPadding = 0
        tv.alwaysBounceVertical = true
        tv.isFindInteractionEnabled = true
        let document = NSMutableAttributedString(attributedString: text.utf16.count <= Self.highlightLimit
            ? DiffHighlighter.attributedDocument(text, ext: ext)
            : NSAttributedString(string: text, attributes: [.font: DiffTypography.codeFont,
                                                            .foregroundColor: UIColor.label]))
        let target = line > 0 ? Self.lineRange(line, in: text) : nil
        if let target {
            document.addAttribute(.backgroundColor, value: UIColor.systemYellow.withAlphaComponent(0.3), range: target)
        }
        tv.attributedText = document
        if line > 1, let target {
            DispatchQueue.main.async {
                tv.scrollRangeToVisible(NSRange(location: target.location, length: 0))
            }
        }
        handle?.attach(tv)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {}

    func makeCoordinator() -> CodeViewHandle? { handle }

    static func dismantleUIView(_ tv: UITextView, coordinator: CodeViewHandle?) {
        coordinator?.attach(nil)
    }

    /// The UTF-16 range of line `line` (1-based), without its newline.
    static func lineRange(_ line: Int, in text: String) -> NSRange? {
        guard let start = utf16Offset(ofLine: line, in: text) else { return nil }
        let units = text.utf16
        var end = start
        var index = units.index(units.startIndex, offsetBy: start)
        while index != units.endIndex, units[index] != 0x0A {
            end += 1
            index = units.index(after: index)
        }
        return NSRange(location: start, length: end - start)
    }

    static func utf16Offset(ofLine line: Int, in text: String) -> Int? {
        var remaining = line - 1
        var offset = 0
        for unit in text.utf16 {
            if remaining == 0 { return offset }
            offset += 1
            if unit == 0x0A { remaining -= 1 }
        }
        return remaining == 0 ? offset : nil
    }
}
