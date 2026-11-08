import ImageIO
import UIKit
import UniformTypeIdentifiers

/// What another app shared: its links, text and images, read once from the
/// extension's input. Images are decoded scaled down, so each one fits a single
/// frame to the Mac and a large photo stays within the extension's memory.
struct SharedItems {
    private static let maxSide = 2048
    /// Enough for the sheet's thumbnail to fill its square sharply.
    private static let thumbnailSide = 400

    var links: [URL] = []
    var texts: [String] = []
    var images: [Data] = []
    var thumbnail: UIImage?
    /// The page title another app gave the link, when it gave one.
    var title: String?

    var isEmpty: Bool { links.isEmpty && texts.isEmpty && images.isEmpty }

    /// The links and text as the prompt's or note's paragraphs.
    var text: String {
        PendingShare.paragraphs(texts + links.map(\.absoluteString))
    }

    var headline: String {
        if let title, !title.isEmpty { return title }
        if let link = links.first { return link.host() ?? link.absoluteString }
        if let first = texts.first?.split(separator: "\n").first { return String(first) }
        return imageCount
    }

    var detail: String {
        var parts: [String] = []
        if let link = links.first, title?.isEmpty == false || link.host() != nil {
            parts.append(link.absoluteString)
        }
        if !images.isEmpty, title != nil || !links.isEmpty || !texts.isEmpty {
            parts.append(imageCount)
        }
        return parts.joined(separator: " · ")
    }

    private var imageCount: String { images.count == 1 ? "1 image" : "\(images.count) images" }

    static func load(from items: [NSExtensionItem]) async -> SharedItems {
        var shared = SharedItems()
        for item in items {
            if shared.title == nil, let title = item.attributedTitle?.string, !title.isEmpty {
                shared.title = title
            }
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    if let source = await imageSource(provider), let image = downsampled(source, to: maxSide) {
                        if shared.thumbnail == nil {
                            shared.thumbnail = downsampled(source, to: thumbnailSide).map { UIImage(cgImage: $0) }
                        }
                        if let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.8) {
                            shared.images.append(data)
                        }
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                       !url.isFileURL {
                        shared.links.append(url)
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                        shared.add(text: text)
                    }
                }
            }
            if shared.texts.isEmpty, let content = item.attributedContentText?.string {
                shared.add(text: content)
            }
        }
        return shared
    }

    /// Text that isn't just one of the links again.
    private mutating func add(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !links.contains(where: { $0.absoluteString == trimmed }),
              !texts.contains(trimmed) else { return }
        if let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true, !trimmed.contains(" ") {
            links.append(url)
        } else {
            texts.append(trimmed)
        }
    }

    private static func imageSource(_ provider: NSItemProvider) async -> CGImageSource? {
        let item = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier)
        switch item {
        case let url as URL: return CGImageSourceCreateWithURL(url as CFURL, nil)
        case let data as Data: return CGImageSourceCreateWithData(data as CFData, nil)
        // Already decoded by the app that shared it. JPEG, unlike PNG, keeps its orientation.
        case let image as UIImage:
            return image.jpegData(compressionQuality: 1).flatMap { CGImageSourceCreateWithData($0 as CFData, nil) }
        default: return nil
        }
    }

    /// The image upright, decoded straight to at most `side` pixels on its longer side.
    private static func downsampled(_ source: CGImageSource, to side: Int) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceThumbnailMaxPixelSize: side,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
