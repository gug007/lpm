// clipboard save|restore <file> | clear | count: the whole pasteboard (every
// item, every type: text, images, file references) to a file and back, so a
// take can run on an empty clipboard without losing what the user had copied.
// A write that fails exits non-zero, so the caller keeps its backup.
// LESSON_PASTEBOARD names another pasteboard (tests).
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: clipboard save|restore <file> | clear | count\n".data(using: .utf8)!)
    exit(2)
}
let name = ProcessInfo.processInfo.environment["LESSON_PASTEBOARD"]
let board = name.map { NSPasteboard(name: NSPasteboard.Name($0)) } ?? NSPasteboard.general

switch args[1] {
case "save":
    let items: [[String: Data]] = (board.pasteboardItems ?? []).map { item in
        var types: [String: Data] = [:]
        for type in item.types { if let data = item.data(forType: type) { types[type.rawValue] = data } }
        return types
    }
    let data = try PropertyListSerialization.data(fromPropertyList: items, format: .binary, options: 0)
    let part = args[2] + ".part"
    guard FileManager.default.createFile(atPath: part, contents: data, attributes: [.posixPermissions: 0o600]) else {
        FileHandle.standardError.write("could not write \(part)\n".data(using: .utf8)!)
        exit(1)
    }
    _ = try FileManager.default.replaceItemAt(URL(fileURLWithPath: args[2]), withItemAt: URL(fileURLWithPath: part))
    print(items.count)
case "restore":
    let data = try Data(contentsOf: URL(fileURLWithPath: args[2]))
    let items = try PropertyListSerialization.propertyList(from: data, format: nil) as? [[String: Data]] ?? []
    board.clearContents()
    let restored = items.map { types -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type, value) in types { item.setData(value, forType: NSPasteboard.PasteboardType(type)) }
        return item
    }
    if !restored.isEmpty && !board.writeObjects(restored) {
        FileHandle.standardError.write("the clipboard refused the saved items\n".data(using: .utf8)!)
        exit(1)
    }
    print(restored.count)
case "clear":
    board.clearContents()
case "count":
    print(board.pasteboardItems?.count ?? 0)
default:
    exit(2)
}
