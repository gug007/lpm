package cx.lpm.mobile.core.demo

// Demo Mode's conversations (`conversationWatch` and its requests): each agent tab's
// prompts, answers and steps, added as its scripted agent puts them on screen and
// pushed while the phone watches.

internal fun DemoServer.registerConversationHandlers() {
    register("conversationWatch") { o ->
        val id = o.string("id") ?: return@register
        world.conversationWatches += id
        push(conversationFrame(id, reset = true, items = world.conversations[id].orEmpty()))
    }
    register("conversationUnwatch") { o ->
        val id = o.string("id") ?: return@register
        world.conversationWatches -= id
    }
    register("conversationPage") { o ->
        pushAfter(
            0.25,
            mapOf(
                "t" to "conversationPage",
                "id" to o.string("id").orEmpty(),
                "ok" to true,
                "items" to emptyList<Dict>(),
                "more" to false,
                "reqId" to (o["reqId"] ?: "")
            )
        )
    }
    register("conversationDetail") { o ->
        val id = o.string("id").orEmpty()
        val item = o.string("item").orEmpty()
        val reply = mutableMapOf<String, Any?>(
            "t" to "conversationDetail",
            "id" to id,
            "item" to item,
            "reqId" to (o["reqId"] ?: "")
        )
        if (world.conversations[id].orEmpty().any { it["id"] == item }) {
            reply["ok"] = true
            reply["parts"] = stepParts[item.substringAfterLast("/")].orEmpty()
        } else {
            reply["ok"] = false
            reply["error"] = "This isn't in the conversation any more."
        }
        pushAfter(0.25, reply)
    }
}

internal fun DemoServer.demoConversationPrompt(id: String, text: String) {
    val prompt = text.replace("\r", "\n").trim()
    if (prompt.isEmpty()) return
    demoConversationAdd(id, mapOf("kind" to "prompt", "text" to prompt))
}

internal fun DemoServer.demoConversationText(id: String, text: String) =
    demoConversationAdd(id, mapOf("kind" to "text", "text" to text))

/** What the sample run's step [index] adds, if anything. */
internal fun DemoServer.demoConversationStep(id: String, index: Int) {
    val (name, item) = scriptSteps[index] ?: return
    demoConversationAdd(id, item, name)
}

private fun DemoServer.demoConversationAdd(id: String, fields: Dict, name: String? = null) {
    val items = world.conversations.getOrPut(id) { mutableListOf() }
    val item = fields + ("id" to "$id/${name ?: items.size}")
    items += item
    if (id in world.conversationWatches) {
        push(conversationFrame(id, reset = false, items = listOf(item)))
    }
}

private fun DemoServer.conversationFrame(id: String, reset: Boolean, items: List<Dict>): Dict {
    val frame = mutableMapOf<String, Any?>(
        "t" to "conversation",
        "id" to id,
        "project" to demoTerminal(id)?.project.orEmpty(),
        "ok" to true,
        "reset" to reset,
        "items" to items
    )
    if (reset) frame["more"] = false
    return frame
}

private fun tool(
    what: String,
    verb: String,
    subject: String,
    path: String = "",
    added: Int? = null,
    removed: Int? = null,
    note: String = ""
): Dict = buildMap {
    put("kind", "tool")
    put("what", what)
    put("verb", verb)
    put("subject", subject)
    put("code", true)
    put("state", "done")
    if (path.isNotEmpty()) put("path", path)
    added?.let { put("added", it) }
    removed?.let { put("removed", it) }
    if (note.isNotEmpty()) put("note", note)
}

private fun prompt(text: String): Dict = mapOf("kind" to "prompt", "text" to text)

private fun said(text: String): Dict = mapOf("kind" to "text", "text" to text)

private const val PAGE = "app/checkout/page.tsx"
private const val FORM = "components/CheckoutForm.tsx"
private const val PAYMENTS = "lib/payments.ts"

private val scriptSteps: Map<Int, Pair<String, Dict>> = mapOf(
    0 to (
        "ask" to prompt(
            "Implement the checkout redesign: split the form into shipping and payment steps, " +
                "and move the payment logic into lib/payments.ts"
        )
        ),
    1 to ("look" to said("I'll look at the current checkout implementation first.")),
    2 to ("read-page" to tool("read", "Read", "page.tsx", path = PAGE)),
    3 to ("read-form" to tool("read", "Read", "CheckoutForm.tsx", path = FORM)),
    4 to (
        "plan" to said(
            "The form validates and charges the card inline. I'll extract that into a new " +
                "`lib/payments.ts` module, then split the form into a shipping step and a " +
                "payment step."
        )
        ),
    5 to (
        "payments" to
            tool("edit", "Created", "payments.ts", path = PAYMENTS, note = "86 lines")
        ),
    6 to (
        "form" to
            tool("edit", "Edited", "CheckoutForm.tsx", path = FORM, added = 42, removed = 18)
        ),
    7 to ("page" to tool("edit", "Edited", "page.tsx", path = PAGE, added = 9, removed = 3)),
    8 to ("test" to tool("run", "Ran", "npm test")),
    9 to (
        "readme" to
            tool("edit", "Edited", "README.md", path = "README.md", added = 6, removed = 0)
        ),
    10 to (
        "done" to said(
            "Done — checkout is now a two-step flow:\n\n" +
                "- **lib/payments.ts** — payment intent creation and card validation\n" +
                "- **components/CheckoutForm.tsx** — shipping and payment steps\n" +
                "- **app/checkout/page.tsx** — wires up the step state\n" +
                "- **README.md** — documents the new flow\n\n" +
                "All 23 tests pass. Want me to update the cart badge to match the new flow?"
        )
        )
)

private fun part(label: String, style: String, text: String): Dict = buildMap {
    put("style", style)
    put("text", text)
    if (label.isNotEmpty()) put("label", label)
}

private val stepParts: Map<String, List<Dict>> = mapOf(
    "read-page" to listOf(part("File", "code", PAGE)),
    "read-form" to listOf(part("File", "code", FORM)),
    "payments" to listOf(
        part("File", "code", PAYMENTS),
        part(
            "Contents",
            "code",
            "import { stripe } from \"./stripe\";\n\n" +
                "export async function createPaymentIntent(cart: Cart) {\n" +
                "  return stripe.paymentIntents.create({\n" +
                "    amount: cart.total,\n" +
                "    currency: \"usd\",\n" +
                "  });\n}"
        )
    ),
    "form" to listOf(
        part("File", "code", FORM),
        part(
            "",
            "diff",
            "@@ -38,4 +38,6 @@\n" +
                "   const [step, setStep] = useState(\"shipping\");\n" +
                "-  const charge = await fetch(\"/api/charge\", { method: \"POST\" });\n" +
                "+  const intent = await createPaymentIntent(cart);\n" +
                "+  if (!intent.client_secret) return setError(intent);\n" +
                "   setStep(\"done\");"
        )
    ),
    "page" to listOf(
        part("File", "code", PAGE),
        part(
            "",
            "diff",
            "@@ -12,2 +12,3 @@\n" +
                "-  return <CheckoutForm />;\n" +
                "+  const [step, setStep] = useState<Step>(\"shipping\");\n" +
                "+  return <CheckoutForm step={step} onStep={setStep} />;"
        )
    ),
    "test" to listOf(
        part("Command", "code", "npm test"),
        part(
            "Output",
            "code",
            " ✓ lib/payments.test.ts (9 tests)\n" +
                " ✓ components/CheckoutForm.test.tsx (8 tests)\n" +
                " ✓ app/checkout/page.test.tsx (6 tests)\n\n" +
                " Test Files  3 passed (3)\n" +
                "      Tests  23 passed (23)"
        )
    ),
    "readme" to listOf(
        part("File", "code", "README.md"),
        part(
            "",
            "diff",
            "@@ -20,0 +21,2 @@\n+## Checkout\n+Two steps: shipping, then payment."
        )
    )
)
