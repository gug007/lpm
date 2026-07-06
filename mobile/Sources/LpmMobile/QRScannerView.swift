import SwiftUI
import AVFoundation

/// A pairing payload decoded from the desktop's QR code:
/// `lpm://pair?h=<host>&p=<port>&c=<code>`.
struct PairPayload {
    let host: String
    let port: Int
    let code: String

    init?(_ raw: String) {
        guard let comps = URLComponents(string: raw),
              comps.scheme == "lpm", comps.host == "pair"
        else { return nil }
        let items = comps.queryItems ?? []
        func q(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard let h = q("h"), let c = q("c") else { return nil }
        host = h
        port = Int(q("p") ?? "8765") ?? 8765
        code = c
    }
}

/// Full-screen QR scanner. Calls `onScan` once with the first decoded pairing
/// payload and dismisses. Requires `NSCameraUsageDescription` in Info.plist.
struct QRScannerView: View {
    let onScan: (PairPayload) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var denied = false

    var body: some View {
        ZStack {
            CameraPreview(
                onCode: { raw in
                    guard let payload = PairPayload(raw) else { return }
                    onScan(payload)
                    dismiss()
                },
                onDenied: { denied = true }
            )
            .ignoresSafeArea()

            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2).foregroundStyle(.white).padding()
                    }
                }
                Spacer()
                Text(denied
                     ? "Camera access is off. Enable it in Settings, or enter the code manually."
                     : "Scan the QR from lpm → Settings → Mobile devices → Add device")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
                    .padding()
            }
        }
    }
}

/// Hosts an AVCaptureSession preview and reports decoded QR strings.
struct CameraPreview: UIViewRepresentable {
    let onCode: (String) -> Void
    let onDenied: () -> Void

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        context.coordinator.start(on: view, onCode: onCode, onDenied: onDenied)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        private let session = AVCaptureSession()
        private let sessionQueue = DispatchQueue(label: "cx.lpm.camera")
        private var onCode: ((String) -> Void)?
        private var handled = false

        func start(on view: PreviewView, onCode: @escaping (String) -> Void, onDenied: @escaping () -> Void) {
            self.onCode = onCode
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                configure(view)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        granted ? self.configure(view) : onDenied()
                    }
                }
            default:
                DispatchQueue.main.async(execute: onDenied)
            }
        }

        private func configure(_ view: PreviewView) {
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input)
            else { return }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            output.metadataObjectTypes = [.qr]

            view.videoLayer.session = session
            view.videoLayer.videoGravity = .resizeAspectFill
            sessionQueue.async { self.session.startRunning() }
        }

        func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard !handled,
                  let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let value = obj.stringValue
            else { return }
            handled = true
            onCode?(value)
            stop()
        }

        func stop() {
            sessionQueue.async {
                if self.session.isRunning { self.session.stopRunning() }
                // The metadata output retains its delegate (self) strongly, closing
                // a Coordinator → session → output → Coordinator cycle. Clear the
                // delegate and drop the graph so the session + camera input free.
                for output in self.session.outputs {
                    (output as? AVCaptureMetadataOutput)?.setMetadataObjectsDelegate(nil, queue: nil)
                    self.session.removeOutput(output)
                }
                for input in self.session.inputs {
                    self.session.removeInput(input)
                }
            }
        }
    }
}

/// A UIView backed directly by an AVCaptureVideoPreviewLayer.
final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var videoLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
