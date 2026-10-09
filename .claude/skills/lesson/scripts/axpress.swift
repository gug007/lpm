// axpress <pid> <text>: performs the press action of the first button in the
// app's windows whose title, description or help is <text>.
// axpress <pid> --at <x> <y> [<label>]: presses the element labelled <label>
// nearest that screen point (global points); without a label, the element at
// the point or its nearest ancestor that can be pressed. Device Hub shows the
// simulated iPhone's own accessibility elements (its hit test reaches only
// some of them, the labelled tree all), so this is how a lesson taps lpm Link. An Accessibility action: no click or keystroke
// reaches any app. Exits 1 when there is nothing to press.
// axpress <pid> --cancel <label>: AXCancel on the element labelled <label>,
// which on the simulated iPhone is the system's back gesture.
import ApplicationServices
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("axpress: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3, let pid = Int32(args[1]) else {
    fail("usage: axpress <pid> <text> | axpress <pid> --at <x> <y>")
}

func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    var v: CFTypeRef?
    return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}

func pressable(_ e: AXUIElement) -> Bool {
    var names: CFArray?
    guard AXUIElementCopyActionNames(e, &names) == .success, let list = names as? [String] else { return false }
    return list.contains(kAXPressAction)
}

let app = AXUIElementCreateApplication(pid)

func frame(_ e: AXUIElement) -> CGRect? {
    guard let pos = attr(e, kAXPositionAttribute), let size = attr(e, kAXSizeAttribute) else { return nil }
    var p = CGPoint.zero
    var s = CGSize.zero
    AXValueGetValue(pos as! AXValue, .cgPoint, &p)
    AXValueGetValue(size as! AXValue, .cgSize, &s)
    return CGRect(origin: p, size: s)
}

func labelled(_ e: AXUIElement, _ label: String, _ depth: Int, into found: inout [AXUIElement]) {
    if pressable(e), [kAXTitleAttribute, kAXDescriptionAttribute].contains(where: { attr(e, $0) as? String == label }) {
        found.append(e)
    }
    guard depth < 16 else { return }
    for child in (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] { labelled(child, label, depth + 1, into: &found) }
}

if args[2] == "--cancel" {
    guard args.count == 4 else { fail("usage: axpress <pid> --cancel <label>") }
    func cancellable(_ e: AXUIElement, _ depth: Int) -> AXUIElement? {
        var names: CFArray?
        if [kAXTitleAttribute, kAXDescriptionAttribute].contains(where: { attr(e, $0) as? String == args[3] }),
           AXUIElementCopyActionNames(e, &names) == .success, (names as? [String])?.contains(kAXCancelAction) == true {
            return e
        }
        guard depth < 16 else { return nil }
        for child in (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
            if let hit = cancellable(child, depth + 1) { return hit }
        }
        return nil
    }
    for window in (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
        if let e = cancellable(window, 0) { exit(AXUIElementPerformAction(e, kAXCancelAction as CFString) == .success ? 0 : 1) }
    }
    fail("nothing labelled \"\(args[3])\" to cancel")
}

if args[2] == "--at" {
    guard args.count == 5 || args.count == 6, let x = Float(args[3]), let y = Float(args[4]) else { fail("usage: axpress <pid> --at <x> <y> [<label>]") }
    if args.count == 6 {
        var found: [AXUIElement] = []
        for window in (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [] { labelled(window, args[5], 0, into: &found) }
        let point = CGPoint(x: CGFloat(x), y: CGFloat(y))
        let distance = { (e: AXUIElement) -> CGFloat in
            guard let f = frame(e) else { return .greatestFiniteMagnitude }
            return f.contains(point) ? 0 : hypot(f.midX - point.x, f.midY - point.y)
        }
        guard let best = found.min(by: { distance($0) < distance($1) }) else { fail("nothing labelled \"\(args[5])\" to press") }
        exit(AXUIElementPerformAction(best, kAXPressAction as CFString) == .success ? 0 : 1)
    }
    var hit: AXUIElement?
    guard AXUIElementCopyElementAtPosition(app, x, y, &hit) == .success, var element = hit else {
        fail("no element of pid \(pid) at \(x),\(y)")
    }
    for _ in 0..<8 where !pressable(element) {
        guard let parent = attr(element, kAXParentAttribute) else { break }
        element = parent as! AXUIElement
    }
    if !pressable(element) { fail("nothing to press at \(x),\(y)") }
    exit(AXUIElementPerformAction(element, kAXPressAction as CFString) == .success ? 0 : 1)
}

let text = args[2]
func find(_ e: AXUIElement, _ depth: Int) -> AXUIElement? {
    if attr(e, kAXRoleAttribute) as? String == kAXButtonRole,
       [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute].contains(where: { attr(e, $0) as? String == text }) {
        return e
    }
    guard depth < 12 else { return nil }
    for child in (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
        if let hit = find(child, depth + 1) { return hit }
    }
    return nil
}

for window in (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
    if let button = find(window, 0) {
        exit(AXUIElementPerformAction(button, kAXPressAction as CFString) == .success ? 0 : 1)
    }
}
fail("no button \"\(text)\" in pid \(pid)")
