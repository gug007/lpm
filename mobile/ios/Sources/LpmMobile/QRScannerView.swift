import SwiftUI
import AVFoundation

/// A pairing payload decoded from the desktop's QR code:
/// `lpm://pair?p=<port>&c=<code>&h=<host>&h=<host>…&f=<fingerprint>`. The Mac
/// advertises every address it can be reached at (LAN, Tailscale) as repeated `h`
/// params; the phone probes them and keeps the reachable one. `f` is the
/// hex SHA-256 of the Mac's TLS leaf cert — verified during the pairing handshake
/// so the phone pins the right identity. Absent from Macs paired before TLS.
struct PairPayload: Equatable {
    let hosts: [String]
    let port: Int
    let code: String
    let fingerprint: String?

    var host: String { hosts.first ?? "" }

    init?(_ raw: String) {
        guard let comps = URLComponents(string: raw),
              comps.scheme == "lpm", comps.host == "pair"
        else { return nil }
        let items = comps.queryItems ?? []
        func q(_ name: String) -> String? { items.first { $0.name == name }?.value }
        let hs = items.filter { $0.name == "h" }.compactMap(\.value).filter { !$0.isEmpty }
        guard !hs.isEmpty, let c = q("c") else { return nil }
        hosts = hs
        port = Int(q("p") ?? "8765") ?? 8765
        code = c
        let f = q("f")?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        fingerprint = (f?.isEmpty ?? true) ? nil : f
    }
}

/// Full-screen QR scanner. Calls `onScan` once with the first decoded pairing
/// payload and dismisses. Requires `NSCameraUsageDescription` in Info.plist.
struct QRScannerView: View {
    let onScan: (PairPayload) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var denied = false
    @State private var setupFailed = false
    @State private var hasTorch = false
    @State private var torchOn = false

    var body: some View {
        ZStack {
            CameraPreview(
                torchOn: torchOn,
                onCode: { raw in
                    guard let payload = PairPayload(raw) else { return }
                    onScan(payload)
                    dismiss()
                },
                onDenied: { denied = true },
                onSetupFailure: { setupFailed = true },
                onTorchAvailable: { hasTorch = $0 }
            )
            .ignoresSafeArea()

            if setupFailed {
                Text("Camera unavailable")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding()
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
            } else if !denied {
                ViewfinderCorners()
                    .stroke(.white, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .frame(width: 240, height: 240)
                    .shadow(color: .black.opacity(0.3), radius: 4)
                    .accessibilityHidden(true)
            }

            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2).foregroundStyle(.white).padding()
                    }
                }
                Spacer()
                if hasTorch && !denied { torchButton }
                VStack(spacing: 12) {
                    Text(denied
                         ? "Camera access is off. Enable it in Settings, or enter the code manually."
                         : "Scan the QR from lpm: + above your projects → Phone → Pair a device")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                    if denied {
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding()
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
                .padding()
            }
        }
    }

    private var torchButton: some View {
        Button { torchOn.toggle() } label: {
            Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                .font(.title2)
                .foregroundStyle(torchOn ? .black : .white)
                .frame(width: 56, height: 56)
                .background(torchOn ? AnyShapeStyle(.white) : AnyShapeStyle(.ultraThinMaterial), in: Circle())
        }
        .accessibilityLabel(torchOn ? "Turn Torch Off" : "Turn Torch On")
    }
}

/// The four corners of the square to hold the code in.
private struct ViewfinderCorners: Shape {
    var length: CGFloat = 40
    var radius: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let corners: [(CGPoint, CGFloat, CGFloat)] = [
            (CGPoint(x: rect.minX, y: rect.minY), 1, 1),
            (CGPoint(x: rect.maxX, y: rect.minY), -1, 1),
            (CGPoint(x: rect.maxX, y: rect.maxY), -1, -1),
            (CGPoint(x: rect.minX, y: rect.maxY), 1, -1),
        ]
        for (corner, dx, dy) in corners {
            path.move(to: CGPoint(x: corner.x, y: corner.y + dy * length))
            path.addArc(tangent1End: corner, tangent2End: CGPoint(x: corner.x + dx * length, y: corner.y),
                        radius: radius)
            path.addLine(to: CGPoint(x: corner.x + dx * length, y: corner.y))
        }
        return path
    }
}

/// Hosts an AVCaptureSession preview and reports decoded QR strings.
struct CameraPreview: UIViewRepresentable {
    var torchOn = false
    let onCode: (String) -> Void
    let onDenied: () -> Void
    let onSetupFailure: () -> Void
    var onTorchAvailable: (Bool) -> Void = { _ in }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        context.coordinator.start(on: view, onCode: onCode, onDenied: onDenied, onSetupFailure: onSetupFailure,
                                  onTorchAvailable: onTorchAvailable)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        context.coordinator.setTorch(torchOn)
    }

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        private let session = AVCaptureSession()
        private let sessionQueue = DispatchQueue(label: "cx.lpm.camera")
        private var onCode: ((String) -> Void)?
        private var onSetupFailure: (() -> Void)?
        private var onTorchAvailable: ((Bool) -> Void)?
        private var handled = false
        // Touched on `sessionQueue` only, once configured.
        private var device: AVCaptureDevice?
        private var torchOn = false

        func start(on view: PreviewView, onCode: @escaping (String) -> Void,
                   onDenied: @escaping () -> Void, onSetupFailure: @escaping () -> Void,
                   onTorchAvailable: @escaping (Bool) -> Void) {
            self.onCode = onCode
            self.onSetupFailure = onSetupFailure
            self.onTorchAvailable = onTorchAvailable
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
            else { onSetupFailure?(); return }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { onSetupFailure?(); return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            output.metadataObjectTypes = [.qr]

            view.videoLayer.session = session
            view.videoLayer.videoGravity = .resizeAspectFill
            sessionQueue.async {
                self.session.startRunning()
                self.device = device
            }
            let torch = device.hasTorch && device.isTorchModeSupported(.on)
            DispatchQueue.main.async { self.onTorchAvailable?(torch) }
        }

        func setTorch(_ on: Bool) {
            guard on != torchOn else { return }
            torchOn = on
            sessionQueue.async {
                guard let device = self.device, device.hasTorch,
                      (try? device.lockForConfiguration()) != nil else { return }
                device.torchMode = on ? .on : .off
                device.unlockForConfiguration()
            }
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
                self.device = nil
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
