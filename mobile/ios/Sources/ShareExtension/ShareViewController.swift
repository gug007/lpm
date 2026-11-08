import SwiftUI
import UIKit

/// The share extension's entry point: the sheet, fed what the other app shared.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let model = ShareModel(directory: .load())
        let sheet = ShareView(model: model, onDone: { [weak self] in self?.finish() },
                              onCancel: { [weak self] in self?.cancel() })
        let host = UIHostingController(rootView: sheet)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)

        let inputs = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        Task {
            model.items = await SharedItems.load(from: inputs)
            model.phase = .ready
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
