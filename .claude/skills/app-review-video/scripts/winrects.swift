// winrects: the on-screen windows as JSON lines {pid, owner, layer, x, y, w, h}
// in global points (top-left origin), front to back, plus the main display's
// size as the first line {screen: {w, h}}.
import CoreGraphics
import Foundation

let screen = CGDisplayBounds(CGMainDisplayID())
print("{\"screen\":{\"w\":\(Int(screen.width)),\"h\":\(Int(screen.height))}}")
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in windows {
    guard let raw = w[kCGWindowBounds as String] as? NSDictionary,
          let b = CGRect(dictionaryRepresentation: raw) else { continue }
    let owner = (w[kCGWindowOwnerName as String] as? String ?? "?").replacingOccurrences(of: "\"", with: "'")
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    print("{\"pid\":\(pid),\"owner\":\"\(owner)\",\"layer\":\(layer),\"x\":\(Int(b.minX)),\"y\":\(Int(b.minY)),\"w\":\(Int(b.width)),\"h\":\(Int(b.height))}")
}
