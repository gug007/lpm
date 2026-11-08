import SwiftUI

/// Rows grouped in a rounded panel outside a List, sized and divided as an inset
/// grouped List's rows are.
enum PanelRow {
    static let height: CGFloat = 50
    static let inset: CGFloat = 16
    /// Where a divider starts: past the row's icon, under its title.
    static let dividerInset: CGFloat = 56
}

struct PanelRowDivider: View {
    var body: some View {
        Divider().padding(.leading, PanelRow.dividerInset)
    }
}

extension View {
    /// A panel row's height and insets, all of it tappable; nothing in a List.
    @ViewBuilder func panelRowFrame(_ panel: Bool, trailing: CGFloat = PanelRow.inset) -> some View {
        if panel {
            padding(.leading, PanelRow.inset)
                .padding(.trailing, trailing)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, minHeight: PanelRow.height, alignment: .leading)
                .contentShape(Rectangle())
        } else {
            self
        }
    }

    /// Rows in a rounded panel on the sheet's grouped background.
    func panelBackground() -> some View {
        background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
