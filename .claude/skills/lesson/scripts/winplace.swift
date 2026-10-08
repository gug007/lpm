// winplace <pid> [<x> <y> [<w> <h>]]: the frame of the app's largest window as
// "x y w h" (global points, top-left origin); with <x> <y>, moves that window
// there first, and with <w> <h> sizes it too. Goes through the Accessibility
// API, so no click or keystroke reaches any app.
import ApplicationServices
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("winplace: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard [2, 4, 6].contains(args.count), let pid = Int32(args[1]) else {
    fail("usage: winplace <pid> [<x> <y> [<w> <h>]]")
}

func frame(_ window: AXUIElement) -> CGRect? {
    var pos: CFTypeRef?
    var size: CFTypeRef?
    guard AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &pos) == .success,
          AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &size) == .success else { return nil }
    var p = CGPoint.zero
    var s = CGSize.zero
    AXValueGetValue(pos as! AXValue, .cgPoint, &p)
    AXValueGetValue(size as! AXValue, .cgSize, &s)
    return CGRect(origin: p, size: s)
}

let app = AXUIElementCreateApplication(pid)
var raw: CFTypeRef?
guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw) == .success,
      let windows = raw as? [AXUIElement], !windows.isEmpty else {
    fail("no windows for pid \(pid) (Accessibility permission for this terminal?)")
}
let sized = windows.compactMap { w in frame(w).map { (w, $0) } }
guard let (window, _) = sized.max(by: { $0.1.width * $0.1.height < $1.1.width * $1.1.height }) else {
    fail("no window of pid \(pid) reports a frame")
}
if args.count == 6, let w = Double(args[4]), let h = Double(args[5]) {
    var size = CGSize(width: w, height: h)
    let value = AXValueCreate(.cgSize, &size)!
    let err = AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, value)
    if err != .success { fail("could not size the window (\(err.rawValue))") }
    usleep(250_000)
}
if args.count >= 4, let x = Double(args[2]), let y = Double(args[3]) {
    var point = CGPoint(x: x, y: y)
    let value = AXValueCreate(.cgPoint, &point)!
    let err = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value)
    if err != .success { fail("could not move the window (\(err.rawValue))") }
    usleep(150_000)
}
guard let now = frame(window) else { fail("the window lost its frame") }
print("\(Int(now.minX)) \(Int(now.minY)) \(Int(now.width)) \(Int(now.height))")
