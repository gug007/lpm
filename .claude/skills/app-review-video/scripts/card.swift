// card < specs.json: renders each spec {out, w, h, bg, boxes, items} to a PNG
// of w x h pixels. boxes: {x, y, w, h, color, radius}; items: text drawn with
// the system font {text, x, y, w, size, weight, color, align}, where (x, y) is
// the top of the text and `w` (optional) wraps it inside [x, x + w].
import AppKit

struct Box: Decodable { let x, y, w, h: Double; let color: String; let radius: Double? }
struct Item: Decodable {
    let text: String
    let x, y: Double
    let w: Double?
    let size: Double
    let weight: String?
    let color: String?
    let align: String?
}
struct Spec: Decodable {
    let out: String
    let w, h: Int
    let bg: String?
    let boxes: [Box]?
    let items: [Item]?
}

func color(_ hex: String) -> NSColor {
    var s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if s.count == 6 { s += "ff" }
    let v = UInt64(s, radix: 16) ?? 0xffffffff
    return NSColor(srgbRed: CGFloat((v >> 24) & 0xff) / 255, green: CGFloat((v >> 16) & 0xff) / 255,
                   blue: CGFloat((v >> 8) & 0xff) / 255, alpha: CGFloat(v & 0xff) / 255)
}

func font(_ size: Double, _ weight: String?) -> NSFont {
    let weights: [String: NSFont.Weight] = ["regular": .regular, "medium": .medium, "semibold": .semibold, "bold": .bold, "heavy": .heavy]
    return NSFont.systemFont(ofSize: size, weight: weights[weight ?? "regular"] ?? .regular)
}

func render(_ spec: Spec) throws {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: spec.w, pixelsHigh: spec.h, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0),
          let base = NSGraphicsContext(bitmapImageRep: rep) else { throw NSError(domain: "card", code: 1) }
    let cg = base.cgContext
    cg.translateBy(x: 0, y: CGFloat(spec.h))
    cg.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)
    if let bg = spec.bg {
        color(bg).setFill()
        NSRect(x: 0, y: 0, width: spec.w, height: spec.h).fill()
    }
    for b in spec.boxes ?? [] {
        color(b.color).setFill()
        let r = NSRect(x: b.x, y: b.y, width: b.w, height: b.h)
        NSBezierPath(roundedRect: r, xRadius: b.radius ?? 0, yRadius: b.radius ?? 0).fill()
    }
    for it in spec.items ?? [] {
        let para = NSMutableParagraphStyle()
        para.alignment = it.align == "center" ? .center : it.align == "right" ? .right : .left
        para.lineHeightMultiple = 1.08
        let text = NSAttributedString(string: it.text, attributes: [
            .font: font(it.size, it.weight),
            .foregroundColor: color(it.color ?? "#ffffff"),
            .paragraphStyle: para,
        ])
        if let width = it.w {
            text.draw(with: NSRect(x: it.x, y: it.y, width: width, height: Double(spec.h)), options: [.usesLineFragmentOrigin])
        } else {
            let size = text.size()
            let x = it.align == "center" ? it.x - size.width / 2 : it.align == "right" ? it.x - size.width : it.x
            text.draw(at: NSPoint(x: x, y: it.y))
        }
    }
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { throw NSError(domain: "card", code: 2) }
    try png.write(to: URL(fileURLWithPath: spec.out))
}

do {
    let specs = try JSONDecoder().decode([Spec].self, from: FileHandle.standardInput.readDataToEndOfFile())
    for spec in specs { try render(spec) }
} catch {
    FileHandle.standardError.write("card: \(error)\n".data(using: .utf8)!)
    exit(1)
}
