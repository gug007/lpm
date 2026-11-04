import SwiftUI
import UIKit

/// A check's state as the desktop draws it: a red cross, an amber spinner, a
/// green check, a grey dash.
struct CiStateIcon: View {
    let state: CiCheck.State

    var body: some View {
        switch state {
        case .fail: Image(systemName: "xmark.circle").foregroundStyle(.red)
        case .pending: ProgressView().controlSize(.mini).tint(.orange)
        case .pass: Image(systemName: "checkmark.circle").foregroundStyle(.green)
        case .skipped: Image(systemName: "minus.circle").foregroundStyle(.secondary)
        }
    }
}

extension CiCheck.State {
    /// The same on a menu row: a menu draws plain images in its own tint, so the
    /// color goes into the image and a clock stands in for the spinner.
    var menuIcon: Image {
        let (symbol, color): (String, UIColor) = switch self {
        case .fail: ("xmark.circle", .systemRed)
        case .pending: ("clock", .systemOrange)
        case .pass: ("checkmark.circle", .systemGreen)
        case .skipped: ("minus.circle", .secondaryLabel)
        }
        guard let image = UIImage(systemName: symbol) else { return Image(systemName: symbol) }
        return Image(uiImage: image.withTintColor(color, renderingMode: .alwaysOriginal))
    }
}
