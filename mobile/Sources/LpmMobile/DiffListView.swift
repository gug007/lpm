import SwiftUI
import UIKit

/// The full-screen diff body, backed by a both-axis UICollectionView so an
/// arbitrarily long diff scrolls smoothly with cell reuse. Rows have a fixed
/// height (from the monospaced line height), the content width is
/// max(parsed.totalWidth, viewport) so short diffs still fill the width and long
/// lines scroll horizontally, each pre-highlighted attributed line is dropped
/// straight into a reused label cell, and the line-number gutter is pinned to the
/// left edge under horizontal scroll.
struct DiffListView: UIViewRepresentable {
    let parsed: ParsedDiff

    func makeUIView(context: Context) -> DiffCollectionContainer {
        DiffCollectionContainer()
    }

    func updateUIView(_ view: DiffCollectionContainer, context: Context) {
        view.configure(parsed)
    }
}

final class DiffCollectionContainer: UIView, UICollectionViewDataSource, UICollectionViewDelegate {
    private let layout = DiffColumnLayout()
    private lazy var collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
    private var parsed: ParsedDiff?

    override init(frame: CGRect) {
        super.init(frame: frame)
        collection.dataSource = self
        collection.delegate = self
        collection.backgroundColor = .systemBackground
        collection.showsHorizontalScrollIndicator = true
        collection.showsVerticalScrollIndicator = true
        collection.alwaysBounceVertical = true
        collection.register(DiffLineCell.self, forCellWithReuseIdentifier: DiffLineCell.reuseID)
        collection.contentInsetAdjustmentBehavior = .never
        addSubview(collection)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(_ parsed: ParsedDiff) {
        self.parsed = parsed
        layout.heights = parsed.lines.map {
            $0.kind == .hunk ? DiffTypography.hunkRowHeight : DiffTypography.codeRowHeight
        }
        updateWidth()
        collection.reloadData()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        collection.frame = bounds
        updateWidth()
    }

    private func updateWidth() {
        guard let parsed else { return }
        let width = max(parsed.totalWidth, bounds.width)
        if layout.rowWidth != width {
            layout.rowWidth = width
            layout.invalidateLayout()
        }
    }

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        parsed?.lines.count ?? 0
    }

    func collectionView(_ collectionView: UICollectionView,
                         cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: DiffLineCell.reuseID, for: indexPath)
        if let line = parsed?.lines[indexPath.item], let cell = cell as? DiffLineCell, let parsed {
            cell.configure(line, gutterWidth: parsed.gutterWidth)
            cell.pinnedX = max(0, collectionView.contentOffset.x)
        }
        return cell
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let x = max(0, scrollView.contentOffset.x)
        for case let cell as DiffLineCell in collection.visibleCells { cell.pinnedX = x }
    }
}

/// A single-column layout that scrolls both axes: every row spans the full
/// `rowWidth`, stacked at a fixed per-row height, with a binary-searched visible
/// range so thousands of rows lay out cheaply.
final class DiffColumnLayout: UICollectionViewLayout {
    var rowWidth: CGFloat = 0
    var heights: [CGFloat] = []

    private var offsets: [CGFloat] = []
    private var totalHeight: CGFloat = 0

    override func prepare() {
        offsets = []
        offsets.reserveCapacity(heights.count)
        var y: CGFloat = 0
        for h in heights { offsets.append(y); y += h }
        totalHeight = y
    }

    override var collectionViewContentSize: CGSize { CGSize(width: rowWidth, height: totalHeight) }

    override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
        newBounds.width != collectionView?.bounds.width
    }

    override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        guard indexPath.item < heights.count else { return nil }
        let attr = UICollectionViewLayoutAttributes(forCellWith: indexPath)
        attr.frame = CGRect(x: 0, y: offsets[indexPath.item], width: rowWidth, height: heights[indexPath.item])
        return attr
    }

    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        guard !heights.isEmpty else { return [] }
        var result: [UICollectionViewLayoutAttributes] = []
        var i = firstIndex(atY: rect.minY)
        while i < heights.count && offsets[i] < rect.maxY {
            if let attr = layoutAttributesForItem(at: IndexPath(item: i, section: 0)) { result.append(attr) }
            i += 1
        }
        return result
    }

    private func firstIndex(atY y: CGFloat) -> Int {
        var lo = 0, hi = heights.count - 1, res = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if offsets[mid] <= y { res = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        return res
    }
}

final class DiffLineCell: UICollectionViewCell {
    static let reuseID = "DiffLineCell"

    private let codeLabel = UILabel()
    private let gutter = UIView()
    private let numberLabel = UILabel()
    private let markerLabel = UILabel()
    private var gutterWidth: CGFloat = 40
    private var isHunk = false

    // The horizontal content offset; the gutter tracks it so it stays pinned at the
    // visible left edge while code scrolls beneath its opaque background.
    var pinnedX: CGFloat = 0 { didSet { if pinnedX != oldValue { setNeedsLayout() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.clipsToBounds = true
        codeLabel.numberOfLines = 1
        contentView.addSubview(codeLabel)

        gutter.backgroundColor = .secondarySystemBackground
        numberLabel.font = DiffTypography.gutterFont
        numberLabel.textColor = .tertiaryLabel
        numberLabel.textAlignment = .right
        markerLabel.font = DiffTypography.gutterFont
        markerLabel.textAlignment = .center
        gutter.addSubview(numberLabel)
        gutter.addSubview(markerLabel)
        contentView.addSubview(gutter)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(_ line: DiffLine, gutterWidth: CGFloat) {
        self.gutterWidth = gutterWidth
        isHunk = line.kind == .hunk
        if isHunk {
            gutter.isHidden = true
            codeLabel.lineBreakMode = .byTruncatingTail
            codeLabel.attributedText = Self.hunkText(label: line.hunkLabel, context: line.text, indent: line.indentHint)
            contentView.backgroundColor = .secondarySystemFill
        } else {
            gutter.isHidden = false
            codeLabel.lineBreakMode = .byClipping
            codeLabel.attributedText = line.attributed
            contentView.backgroundColor = Self.tint(line.kind)
            numberLabel.text = (line.kind == .removed ? line.oldNumber : line.newNumber).map(String.init) ?? ""
            markerLabel.text = Self.marker(line.kind)
            markerLabel.textColor = Self.markerColor(line.kind)
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if isHunk {
            codeLabel.frame = CGRect(x: 12, y: 0, width: bounds.width - 24, height: bounds.height)
            return
        }
        codeLabel.frame = CGRect(x: gutterWidth + 6, y: 0,
                                 width: max(0, bounds.width - gutterWidth - 12), height: bounds.height)
        gutter.frame = CGRect(x: pinnedX, y: 0, width: gutterWidth, height: bounds.height)
        let markerWidth: CGFloat = 12
        numberLabel.frame = CGRect(x: 4, y: 0, width: gutterWidth - markerWidth - 6, height: bounds.height)
        markerLabel.frame = CGRect(x: gutterWidth - markerWidth - 2, y: 0, width: markerWidth, height: bounds.height)
    }

    static func tint(_ kind: DiffLineKind) -> UIColor {
        switch kind {
        case .added: return UIColor.systemGreen.withAlphaComponent(0.16)
        case .removed: return UIColor.systemRed.withAlphaComponent(0.16)
        default: return .clear
        }
    }

    static func marker(_ kind: DiffLineKind) -> String {
        switch kind {
        case .added: return "+"
        case .removed: return "-"
        default: return ""
        }
    }

    static func markerColor(_ kind: DiffLineKind) -> UIColor {
        switch kind {
        case .added: return .systemGreen
        case .removed: return .systemRed
        default: return .clear
        }
    }

    static func hunkText(label: String, context: String, indent: Int) -> NSAttributedString {
        let out = NSMutableAttributedString(string: label, attributes: [
            .font: DiffTypography.hunkLabelFont,
            .foregroundColor: UIColor.secondaryLabel,
        ])
        if !context.isEmpty {
            out.append(NSAttributedString(string: "  " + context, attributes: [
                .font: DiffTypography.hunkContextFont,
                .foregroundColor: UIColor.tertiaryLabel,
            ]))
        }
        if indent > 0 {
            out.append(NSAttributedString(string: "   ⇥ \(indent)", attributes: [
                .font: DiffTypography.hunkContextFont,
                .foregroundColor: UIColor.tertiaryLabel,
            ]))
        }
        return out
    }
}
