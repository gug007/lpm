import CoreTransferable
import SwiftUI
import UniformTypeIdentifiers

/// The recap card as a PNG for the share sheet: the card's own layout drawn at
/// twice its 600 units, 1200 pixels wide, like the desktop's image.
struct RecapShareImage: Transferable {
    let png: Data
    let preview: Image
    let fileName: String

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { $0.png }
            .suggestedFileName { $0.fileName }
    }

    @MainActor
    init?(_ card: RecapCardModel) {
        let renderer = ImageRenderer(content: WeeklyRecapCard(card: card, framed: false))
        renderer.scale = 2
        guard let image = renderer.uiImage, let png = image.pngData() else { return nil }
        self.png = png
        preview = Image(uiImage: image)
        fileName = "\(card.title) \(card.range).png"
    }
}
