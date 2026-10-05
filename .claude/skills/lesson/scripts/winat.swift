// winat <x> <y>: the app whose window is frontmost at that screen point
// (global points, top-left origin, the coordinates cliclick takes), as
// "<pid>\t<owner>\t<layer>", or nothing when no window is there. Windows a
// click passes through are skipped: fully transparent ones, and the Dock's
// screen-sized window.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count == 3, let x = Double(args[1]), let y = Double(args[2]) else {
    FileHandle.standardError.write("usage: winat <x> <y>\n".data(using: .utf8)!)
    exit(2)
}
let point = CGPoint(x: x, y: y)
let screen = CGDisplayBounds(CGMainDisplayID())
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in windows {
    guard let raw = w[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: raw),
          bounds.contains(point) else { continue }
    if let alpha = w[kCGWindowAlpha as String] as? Double, alpha <= 0.01 { continue }
    let owner = w[kCGWindowOwnerName as String] as? String ?? "?"
    if owner == "Dock", bounds.width >= screen.width * 0.9, bounds.height >= screen.height * 0.9 { continue }
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    print("\(pid)\t\(owner)\t\(layer)")
    exit(0)
}
