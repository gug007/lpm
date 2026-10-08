// reviewcap <out.mov> <x> <y> <w> <h> <pw> <ph> <fps> <pid>...: records the
// screen inside the rectangle (global points) to an H.264 movie of <pw>x<ph>
// pixels, with the pointer, and with every app but the given pids left out, so
// the user's other windows, notifications and dialogs never reach the video.
// Other apps are excluded rather than the kept ones included: sharing an app
// puts the system's purple sharing badge over its traffic lights. Apps that
// start later are excluded as they appear. SIGINT or SIGTERM finishes the file;
// the wall-clock time of the movie's first frame goes to stdout as epoch ms.
// Mouse presses, releases and moves (global points) and the moments keys are
// pressed (never which key) go to events.jsonl beside the movie, so the edit
// knows when each action happened.
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("reviewcap: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 10,
      let x = Double(args[2]), let y = Double(args[3]),
      let w = Double(args[4]), let h = Double(args[5]),
      let pw = Int(args[6]), let ph = Int(args[7]),
      let fps = Int32(args[8]) else {
    fail("usage: reviewcap <out.mov> <x> <y> <w> <h> <pw> <ph> <fps> <pid>...")
}
let outURL = URL(fileURLWithPath: args[1])
let kept = Set(args[9...].compactMap { Int32($0) })
try? FileManager.default.removeItem(at: outURL)

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate, SCRecordingOutputDelegate {
    var started = false
    var finished: (() -> Void)?

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {}

    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        guard !started else { return }
        started = true
        print(Int64(Date().timeIntervalSince1970 * 1000))
        fflush(stdout)
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        fail("recording failed: \(error.localizedDescription)")
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        finished?()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fail("the capture stopped: \(error.localizedDescription)")
    }
}

let recorder = Recorder()
var stream: SCStream?

func finish() {
    guard let s = stream else { exit(0) }
    recorder.finished = { exit(0) }
    Task {
        try? await s.stopCapture()
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        exit(0)
    }
}

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
signal(SIGPIPE, SIG_IGN)
let sources = [SIGINT, SIGTERM].map { sig -> DispatchSourceSignal in
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler { finish() }
    src.resume()
    return src
}

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let rect = CGRect(x: x, y: y, width: w, height: h)
        guard let display = content.displays.first(where: { $0.frame.contains(CGPoint(x: rect.midX, y: rect.midY)) }) else {
            fail("no display holds \(rect)")
        }
        let others = { (apps: [SCRunningApplication]) in apps.filter { !kept.contains($0.processID) } }
        let config = SCStreamConfiguration()
        config.sourceRect = rect.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
        config.width = pw
        config.height = ph
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.showsCursor = true
        config.minimumFrameInterval = CMTime(value: 1, timescale: fps)
        config.queueDepth = 6
        let filter = SCContentFilter(display: display, excludingApplications: others(content.applications), exceptingWindows: [])
        let s = SCStream(filter: filter, configuration: config, delegate: recorder)
        try s.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: DispatchQueue(label: "reviewcap"))
        let recConfig = SCRecordingOutputConfiguration()
        recConfig.outputURL = outURL
        recConfig.outputFileType = .mov
        recConfig.videoCodecType = .h264
        try s.addRecordingOutput(SCRecordingOutput(configuration: recConfig, delegate: recorder))
        try await s.startCapture()
        stream = s
        var excluded = Set(others(content.applications).map(\.processID))
        while true {
            try await Task.sleep(nanoseconds: 2_000_000_000)
            guard let now = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) else { continue }
            let apps = others(now.applications)
            let ids = Set(apps.map(\.processID))
            if ids.isSubset(of: excluded) { continue }
            excluded.formUnion(ids)
            try await s.updateContentFilter(SCContentFilter(display: display, excludingApplications: apps, exceptingWindows: []))
        }
    } catch {
        fail(error.localizedDescription)
    }
}
// A listen-only tap: it observes input, it never changes or sends any.
final class EventLog {
    private let out: FileHandle?
    private var lastMove: Int64 = 0

    init(_ url: URL) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
        out = try? FileHandle(forWritingTo: url)
    }

    func write(_ kind: String, _ e: CGEvent?) {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        var line = "{\"t\":\(now),\"k\":\"\(kind)\""
        if let e {
            if kind == "move" {
                guard now - lastMove >= 80 else { return }
                lastMove = now
            }
            line += ",\"x\":\(Int(e.location.x)),\"y\":\(Int(e.location.y))"
        }
        out?.write((line + "}\n").data(using: .utf8)!)
    }
}

let eventLog = EventLog(outURL.deletingLastPathComponent().appendingPathComponent("events.jsonl"))
var eventTap: CFMachPort?
let kinds: [CGEventType: String] = [
    .leftMouseDown: "down", .leftMouseUp: "up", .mouseMoved: "move", .leftMouseDragged: "move", .keyDown: "key",
]
let mask = kinds.keys.reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }
eventTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly, eventsOfInterest: mask,
                             callback: { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
    } else if let kind = kinds[type] {
        eventLog.write(kind, kind == "key" ? nil : event)
    }
    return Unmanaged.passUnretained(event)
}, userInfo: nil)
if let tap = eventTap {
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
} else {
    FileHandle.standardError.write("reviewcap: no input events (the terminal lacks Input Monitoring); the edit falls back to pixel changes\n".data(using: .utf8)!)
}

_ = sources
CFRunLoopRun()
