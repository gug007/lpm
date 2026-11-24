import Foundation

/// Demo Mode's conversations (`conversationWatch` and its requests): each agent tab's
/// prompts, answers and steps, added as its scripted agent puts them on screen and
/// pushed while the phone watches.
extension DemoServer {
    func registerConversationHandlers() {
        register("conversationWatch") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.world.conversationWatches.insert(id)
            self.push(self.conversationFrame(id, reset: true, items: self.world.conversations[id] ?? []))
        }
        register("conversationUnwatch") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.world.conversationWatches.remove(id)
        }
        register("conversationPage") { [weak self] o in
            let reply: [String: Any] = ["t": "conversationPage", "id": o["id"] as? String ?? "", "ok": true,
                                        "items": [[String: Any]](), "more": false, "reqId": o["reqId"] ?? ""]
            self?.pushAfter(0.25, reply)
        }
        register("conversationDetail") { [weak self] o in
            guard let self else { return }
            let id = o["id"] as? String ?? ""
            let item = o["item"] as? String ?? ""
            var reply: [String: Any] = ["t": "conversationDetail", "id": id, "item": item, "reqId": o["reqId"] ?? ""]
            if self.world.conversations[id]?.contains(where: { $0["id"] as? String == item }) == true {
                reply["ok"] = true
                reply["parts"] = Self.stepParts[item.split(separator: "/").last.map(String.init) ?? ""] ?? []
            } else {
                reply["ok"] = false
                reply["error"] = "This isn't in the conversation any more."
            }
            self.pushAfter(0.25, reply)
        }
    }

    func demoConversationPrompt(_ id: String, _ text: String) {
        let text = text.replacingOccurrences(of: "\r", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        demoConversationAdd(id, ["kind": "prompt", "text": text])
    }

    func demoConversationText(_ id: String, _ text: String) {
        demoConversationAdd(id, ["kind": "text", "text": text])
    }

    /// What the sample run's step `index` adds, if anything.
    func demoConversationStep(_ id: String, _ index: Int) {
        guard let step = Self.scriptSteps[index] else { return }
        demoConversationAdd(id, step.item, name: step.name)
    }

    private func demoConversationAdd(_ id: String, _ fields: [String: Any], name: String? = nil) {
        var item = fields
        item["id"] = "\(id)/\(name ?? String((world.conversations[id] ?? []).count))"
        world.conversations[id, default: []].append(item)
        guard world.conversationWatches.contains(id) else { return }
        push(conversationFrame(id, reset: false, items: [item]))
    }

    private func conversationFrame(_ id: String, reset: Bool, items: [[String: Any]]) -> [String: Any] {
        var frame: [String: Any] = ["t": "conversation", "id": id, "project": demoTerminal(id)?.project ?? "", "ok": true,
                                    "reset": reset, "items": items]
        if reset { frame["more"] = false }
        return frame
    }

    // MARK: The sample run

    private static func tool(_ what: String, _ verb: String, _ subject: String, path: String = "",
                             added: Int? = nil, removed: Int? = nil, note: String = "") -> [String: Any] {
        var item: [String: Any] = ["kind": "tool", "what": what, "verb": verb, "subject": subject,
                                   "code": true, "state": "done"]
        if !path.isEmpty { item["path"] = path }
        if let added { item["added"] = added }
        if let removed { item["removed"] = removed }
        if !note.isEmpty { item["note"] = note }
        return item
    }

    private static let scriptSteps: [Int: (name: String, item: [String: Any])] = [
        0: ("ask", ["kind": "prompt", "text": "Implement the checkout redesign: split the form into shipping and payment steps, and move the payment logic into lib/payments.ts"]),
        1: ("look", ["kind": "text", "text": "I'll look at the current checkout implementation first."]),
        2: ("read-page", tool("read", "Read", "page.tsx", path: "app/checkout/page.tsx")),
        3: ("read-form", tool("read", "Read", "CheckoutForm.tsx", path: "components/CheckoutForm.tsx")),
        4: ("plan", ["kind": "text", "text": "The form validates and charges the card inline. I'll extract that into a new `lib/payments.ts` module, then split the form into a shipping step and a payment step."]),
        5: ("payments", tool("edit", "Created", "payments.ts", path: "lib/payments.ts", note: "86 lines")),
        6: ("form", tool("edit", "Edited", "CheckoutForm.tsx", path: "components/CheckoutForm.tsx", added: 42, removed: 18)),
        7: ("page", tool("edit", "Edited", "page.tsx", path: "app/checkout/page.tsx", added: 9, removed: 3)),
        8: ("test", tool("run", "Ran", "npm test")),
        9: ("readme", tool("edit", "Edited", "README.md", path: "README.md", added: 6, removed: 0)),
        10: ("done", ["kind": "text", "text": "Done — checkout is now a two-step flow:\n\n- **lib/payments.ts** — payment intent creation and card validation\n- **components/CheckoutForm.tsx** — shipping and payment steps\n- **app/checkout/page.tsx** — wires up the step state\n- **README.md** — documents the new flow\n\nAll 23 tests pass. Want me to update the cart badge to match the new flow?"]),
    ]

    private static func part(_ label: String, _ style: String, _ text: String) -> [String: Any] {
        var part: [String: Any] = ["style": style, "text": text]
        if !label.isEmpty { part["label"] = label }
        return part
    }

    private static let stepParts: [String: [[String: Any]]] = [
        "read-page": [part("File", "code", "app/checkout/page.tsx")],
        "read-form": [part("File", "code", "components/CheckoutForm.tsx")],
        "payments": [part("File", "code", "lib/payments.ts"),
                     part("Contents", "code", "import { stripe } from \"./stripe\";\n\nexport async function createPaymentIntent(cart: Cart) {\n  return stripe.paymentIntents.create({\n    amount: cart.total,\n    currency: \"usd\",\n  });\n}")],
        "form": [part("File", "code", "components/CheckoutForm.tsx"),
                 part("", "diff", "@@ -38,4 +38,6 @@\n   const [step, setStep] = useState(\"shipping\");\n-  const charge = await fetch(\"/api/charge\", { method: \"POST\" });\n+  const intent = await createPaymentIntent(cart);\n+  if (!intent.client_secret) return setError(intent);\n   setStep(\"done\");")],
        "page": [part("File", "code", "app/checkout/page.tsx"),
                 part("", "diff", "@@ -12,2 +12,3 @@\n-  return <CheckoutForm />;\n+  const [step, setStep] = useState<Step>(\"shipping\");\n+  return <CheckoutForm step={step} onStep={setStep} />;")],
        "test": [part("Command", "code", "npm test"),
                 part("Output", "code", " ✓ lib/payments.test.ts (9 tests)\n ✓ components/CheckoutForm.test.tsx (8 tests)\n ✓ app/checkout/page.test.tsx (6 tests)\n\n Test Files  3 passed (3)\n      Tests  23 passed (23)")],
        "readme": [part("File", "code", "README.md"),
                   part("", "diff", "@@ -20,0 +21,2 @@\n+## Checkout\n+Two steps: shipping, then payment.")],
    ]
}
