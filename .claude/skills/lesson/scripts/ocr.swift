// ocr <image>... : prints "<image>\t<text>" for every line of text Vision
// reads in each image, images in the order given.
import AppKit
import Foundation
import Vision

let files = Array(CommandLine.arguments.dropFirst())
var found = [[String]](repeating: [], count: files.count)
let lock = NSLock()

DispatchQueue.concurrentPerform(iterations: files.count) { i in
    guard let image = NSImage(contentsOfFile: files[i]),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    lock.lock()
    found[i] = lines
    lock.unlock()
}

for (i, file) in files.enumerated() {
    for line in found[i] { print("\(file)\t\(line)") }
}
