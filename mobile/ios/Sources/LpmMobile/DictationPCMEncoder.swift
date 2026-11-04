import AVFoundation

/// Turns the microphone's audio into what the Mac's VoiceToText reads: base64 of
/// 16-bit little-endian mono samples at 16 kHz, a tenth of a second at a time.
final class DictationPCMEncoder: @unchecked Sendable {
    private static let pieceBytes = 3_200

    private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000,
                                       channels: 1, interleaved: true)!
    private let lock = NSLock()
    private var converter: AVAudioConverter?
    private var pending = Data()

    /// One buffer from the mic, and whatever whole pieces it completes.
    func encode(_ buffer: AVAudioPCMBuffer) -> [String] {
        lock.withLock {
            convert(buffer)
            var pieces: [String] = []
            while pending.count >= Self.pieceBytes {
                pieces.append(pending.prefix(Self.pieceBytes).base64EncodedString())
                pending = Data(pending.dropFirst(Self.pieceBytes))
            }
            return pieces
        }
    }

    /// What's left once the last buffer is in.
    func drain() -> String? {
        lock.withLock {
            guard !pending.isEmpty else { return nil }
            defer { pending = Data() }
            return pending.base64EncodedString()
        }
    }

    private func convert(_ buffer: AVAudioPCMBuffer) {
        // A route change can hand over a different format partway through a take.
        if converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: target)
        }
        let ratio = target.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
        guard let converter,
              let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var supplied = false
        // `noDataNow` rather than `endOfStream`: the resampler carries on with the next buffer.
        _ = converter.convert(to: output, error: nil) { _, status in
            guard !supplied else {
                status.pointee = .noDataNow
                return nil
            }
            supplied = true
            status.pointee = .haveData
            return buffer
        }
        guard let samples = output.int16ChannelData?[0], output.frameLength > 0 else { return }
        pending.append(Data(bytes: samples, count: Int(output.frameLength) * MemoryLayout<Int16>.size))
    }
}
