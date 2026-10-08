// Lays each raw simulator screenshot into an App Store image: dark backdrop, a
// headline and subline on top, the screen in a plain device frame below. The
// output PNG has no alpha channel — App Store Connect rejects one.
import AppKit
import UniformTypeIdentifiers

struct Shot: Decodable { let raw: String; let out: String; let title: String; let subtitle: String }
struct Spec: Decodable {
    let device: String
    let width: Int
    let height: Int
    let shots: [Shot]
}

let spec = try JSONDecoder().decode(Spec.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let W = CGFloat(spec.width), H = CGFloat(spec.height)
let isPhone = spec.device == "iphone"

func color(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: a)
}

func drawText(_ text: String, font: NSFont, color: NSColor, top: CGFloat, width: CGFloat, lineHeight: CGFloat) -> CGFloat {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    style.minimumLineHeight = lineHeight
    style.maximumLineHeight = lineHeight
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: style,
                                                .kern: font.pointSize * -0.01]
    let s = NSAttributedString(string: text, attributes: attrs)
    let bounds = s.boundingRect(with: NSSize(width: width, height: 10_000), options: [.usesLineFragmentOrigin])
    let h = ceil(bounds.height)
    s.draw(with: NSRect(x: (W - width) / 2, y: H - top - h, width: width, height: h), options: [.usesLineFragmentOrigin])
    return h
}

func writeOpaquePNG(_ rep: NSBitmapImageRep, to path: String) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: spec.width, height: spec.height, bitsPerComponent: 8, bytesPerRow: 0,
                        space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.draw(rep.cgImage!, in: CGRect(x: 0, y: 0, width: W, height: H))
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("cannot write \(path)") }
}

for shot in spec.shots {
    guard let raw = NSImage(contentsOfFile: shot.raw),
          let cg = raw.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fatalError("cannot read \(shot.raw)")
    }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: spec.width, pixelsHigh: spec.height,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: W, height: H)
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    let c = ctx.cgContext

    NSGradient(colors: [color(0x16181D), color(0x0B0C0F)])!.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)
    NSGradient(colors: [color(0x30D158, 0.22), color(0x30D158, 0)])!
        .draw(fromCenter: NSPoint(x: W / 2, y: H * 0.93), radius: 0,
              toCenter: NSPoint(x: W / 2, y: H * 0.93), radius: W * 0.75, options: [])

    let titleSize: CGFloat = isPhone ? 92 : 112
    let subSize: CGFloat = isPhone ? 44 : 52
    let textWidth = W * (isPhone ? 0.86 : 0.78)
    var y: CGFloat = isPhone ? 150 : 140
    y += drawText(shot.title, font: .systemFont(ofSize: titleSize, weight: .bold), color: .white,
                  top: y, width: textWidth, lineHeight: titleSize * 1.08)
    y += isPhone ? 26 : 30
    y += drawText(shot.subtitle, font: .systemFont(ofSize: subSize, weight: .regular), color: color(0xA1A1AA),
                  top: y, width: textWidth, lineHeight: subSize * 1.3)

    let rawW = CGFloat(cg.width), rawH = CGFloat(cg.height)
    let deviceTop = y + (isPhone ? 80 : 90)
    let bezel: CGFloat = isPhone ? 26 : 30
    let maxScreenH = H - deviceTop - 2 * bezel - (isPhone ? 90 : 100)
    let scale = min(W * 0.80 / rawW, maxScreenH / rawH)
    let sw = rawW * scale, sh = rawH * scale
    let screen = NSRect(x: (W - sw) / 2, y: H - deviceTop - bezel - sh, width: sw, height: sh)
    let screenRadius = (isPhone ? 165 : 72) * scale
    let body = screen.insetBy(dx: -bezel, dy: -bezel)
    let bodyRadius = screenRadius + bezel

    c.saveGState()
    c.setShadow(offset: CGSize(width: 0, height: -30), blur: 90, color: NSColor.black.withAlphaComponent(0.6).cgColor)
    color(0x1C1C1F).setFill()
    NSBezierPath(roundedRect: body, xRadius: bodyRadius, yRadius: bodyRadius).fill()
    c.restoreGState()
    color(0x48484D).setStroke()
    let rim = NSBezierPath(roundedRect: body.insetBy(dx: 2, dy: 2), xRadius: bodyRadius - 2, yRadius: bodyRadius - 2)
    rim.lineWidth = 4
    rim.stroke()

    c.saveGState()
    NSBezierPath(roundedRect: screen, xRadius: screenRadius, yRadius: screenRadius).addClip()
    c.interpolationQuality = .high
    c.draw(cg, in: screen)
    c.restoreGState()

    // simctl screenshots leave the Dynamic Island out; draw it back in.
    if isPhone {
        let iw = 378 * scale, ih = 111 * scale
        let island = NSRect(x: W / 2 - iw / 2, y: screen.maxY - 33 * scale - ih, width: iw, height: ih)
        NSColor.black.setFill()
        NSBezierPath(roundedRect: island, xRadius: ih / 2, yRadius: ih / 2).fill()
    }

    NSGraphicsContext.restoreGraphicsState()
    writeOpaquePNG(rep, to: shot.out)
    print("wrote \(shot.out)")
}
