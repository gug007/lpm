// appcap <pid[,pid…]> <x> <y> <w> <h> <pw> <ph> <fps>: the screen inside the
// rectangle (global points) with every app but the given ones left out, as raw BGRA
// frames of <pw>x<ph> pixels on stdout, one per change. Another app's window,
// a notification or a dialog over the rectangle is never in the picture, so a
// take survives whatever else the Mac is doing. The display is captured with
// the other apps excluded, not the app included: sharing an app puts the
// system's purple sharing badge over its window's traffic lights. Apps that
// start later are excluded as they appear.
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("appcap: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 9,
      case let pids = Set(args[1].split(separator: ",").compactMap({ Int32($0) })), !pids.isEmpty,
      let x = Double(args[2]), let y = Double(args[3]),
      let w = Double(args[4]), let h = Double(args[5]),
      let pw = Int(args[6]), let ph = Int(args[7]),
      let fps = Int32(args[8]) else {
    fail("usage: appcap <pid[,pid…]> <x> <y> <w> <h> <pw> <ph> <fps>")
}
signal(SIGPIPE, SIG_IGN)

final class Output: NSObject, SCStreamOutput, SCStreamDelegate {
    private var frame: [UInt8]
    private let width: Int
    private let height: Int

    init(width: Int, height: Int) {
        self.width = width
        self.height = height
        frame = [UInt8](repeating: 0, count: width * height * 4)
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sample.isValid,
              let info = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int,
              SCFrameStatus(rawValue: raw) == .complete,
              let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pixels) else { return }
        let stride = CVPixelBufferGetBytesPerRow(pixels)
        let rows = min(height, CVPixelBufferGetHeight(pixels))
        let rowBytes = min(width, CVPixelBufferGetWidth(pixels)) * 4
        frame.withUnsafeMutableBytes { out in
            for row in 0..<rows {
                memcpy(out.baseAddress! + row * width * 4, base + row * stride, rowBytes)
            }
        }
        frame.withUnsafeBytes { bytes in
            var at = 0
            while at < bytes.count {
                let n = fwrite(bytes.baseAddress! + at, 1, bytes.count - at, stdout)
                if n <= 0 { exit(0) }
                at += n
            }
        }
        fflush(stdout)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fail("the capture stopped: \(error.localizedDescription)")
    }
}

var running: (SCStream, Output)?

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        for pid in pids where !content.applications.contains(where: { $0.processID == pid }) {
            fail("no app with pid \(pid) has a window on screen")
        }
        let rect = CGRect(x: x, y: y, width: w, height: h)
        guard let display = content.displays.first(where: { $0.frame.contains(CGPoint(x: rect.midX, y: rect.midY)) }) else {
            fail("no display holds \(rect)")
        }
        let others = { (apps: [SCRunningApplication]) in apps.filter { !pids.contains($0.processID) } }
        let filter = SCContentFilter(display: display, excludingApplications: others(content.applications), exceptingWindows: [])
        let config = SCStreamConfiguration()
        config.sourceRect = rect.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
        config.width = pw
        config.height = ph
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.showsCursor = false
        config.minimumFrameInterval = CMTime(value: 1, timescale: fps)
        config.queueDepth = 6
        let output = Output(width: pw, height: ph)
        let stream = SCStream(filter: filter, configuration: config, delegate: output)
        try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "appcap"))
        try await stream.startCapture()
        running = (stream, output)
        var excluded = Set(others(content.applications).map(\.processID))
        while true {
            try await Task.sleep(nanoseconds: 2_000_000_000)
            guard let now = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) else { continue }
            let apps = others(now.applications)
            let ids = Set(apps.map(\.processID))
            if ids.isSubset(of: excluded) { continue }
            excluded.formUnion(ids)
            try await stream.updateContentFilter(SCContentFilter(display: display, excludingApplications: apps, exceptingWindows: []))
        }
    } catch {
        fail(error.localizedDescription)
    }
}
dispatchMain()
