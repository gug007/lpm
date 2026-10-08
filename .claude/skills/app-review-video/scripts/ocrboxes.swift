// ocrboxes <image>...: every line of text Vision reads, as JSON lines
// {i, text, x, y, w, h}: the image's index and the line's box as fractions of
// the image, top-left origin.
import AppKit
import Foundation
import Vision

let files = Array(CommandLine.arguments.dropFirst())
var found = [[String]](repeating: [], count: files.count)
let lock = NSLock()

func json(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [s], options: [])
    return String(String(data: data, encoding: .utf8)!.dropFirst().dropLast())
}

DispatchQueue.concurrentPerform(iterations: files.count) { i in
    guard let image = NSImage(contentsOfFile: files[i]),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { r -> String? in
        guard let text = r.topCandidates(1).first?.string else { return nil }
        let b = r.boundingBox
        return "{\"i\":\(i),\"text\":\(json(text)),\"x\":\(b.minX),\"y\":\(1 - b.maxY),\"w\":\(b.width),\"h\":\(b.height)}"
    }
    lock.lock()
    found[i] = lines
    lock.unlock()
}

for lines in found {
    for line in lines { print(line) }
}
