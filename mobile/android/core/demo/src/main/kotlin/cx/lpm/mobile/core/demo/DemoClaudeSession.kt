package cx.lpm.mobile.core.demo

// The scripted Claude Code session in the agent terminal: the opening run, then a short
// acknowledgement for every prompt sent once it is idle.

internal fun DemoServer.handleClaudeInput(id: String, d: String) {
    val term = demoTerminal(id) ?: return
    if (!term.scriptFinished || term.responding) {
        queueClaudeInput(id, d)
        return
    }
    // A composer submit arrives as a bracketed paste; its embedded CRs are pasted
    // content, not the submit (that CR comes later as its own frame).
    val start = d.indexOf(PASTE_START)
    if (start >= 0) {
        val tail = d.substring(start + PASTE_START.length)
        val end = tail.indexOf(PASTE_END)
        val content = if (end >= 0) tail.substring(0, end) else tail
        if (content.isEmpty()) return
        updateTerminal(id) { it.pendingInput += content }
        emit(id, content.replace("\r", "\r\n  "))
        return
    }
    var pending = term.pendingInput
    var echo = ""
    val chars = d.graphemes()
    var i = 0
    while (i < chars.size) {
        when (val ch = chars[i]) {
            "\u001B" -> {
                i += skipEscape(chars, i)
                continue
            }

            "\r", "\n" -> {
                val submitted = pending
                pending = ""
                updateTerminal(id) { it.pendingInput = "" }
                if (echo.isNotEmpty()) {
                    emit(id, echo)
                    echo = ""
                }
                if (submitted.isNotEmpty()) {
                    claudeRespond(id)
                    return
                }
            }

            "\u007F", "\b" -> if (pending.isNotEmpty()) {
                pending = pending.dropLastGrapheme()
                echo += "\b \b"
            }

            else -> if (ch.codePointAt(0) >= 0x20) {
                pending += ch
                echo += ch
            }
        }
        i += 1
    }
    updateTerminal(id) { it.pendingInput = pending }
    if (echo.isNotEmpty()) emit(id, echo)
}

private fun DemoServer.queueClaudeInput(id: String, d: String) {
    val term = demoTerminal(id) ?: return
    var queued = term.queuedInput
    var submit = term.queuedSubmit
    val chars = d.graphemes()
    var i = 0
    while (i < chars.size) {
        when (val ch = chars[i]) {
            "\u001B" -> {
                i += skipEscape(chars, i)
                continue
            }

            "\r", "\n" -> if (queued.isNotEmpty()) submit = true

            "\u007F", "\b" -> if (queued.isNotEmpty()) queued = queued.dropLastGrapheme()

            else -> if (ch.codePointAt(0) >= 0x20) queued += ch
        }
        i += 1
    }
    updateTerminal(id) {
        it.queuedInput = queued
        it.queuedSubmit = submit
    }
}

private fun DemoServer.flushQueuedClaude(id: String) {
    val term = demoTerminal(id) ?: return
    if (term.queuedInput.isEmpty() && !term.queuedSubmit) return
    val queued = term.queuedInput
    val submit = term.queuedSubmit
    updateTerminal(id) {
        it.queuedInput = ""
        it.queuedSubmit = false
    }
    if (queued.isEmpty()) return
    emit(id, queued)
    if (submit) {
        claudeRespond(id)
    } else {
        updateTerminal(id) { it.pendingInput = queued }
    }
}

private val claudeAcks = listOf(
    "$TEXT_DOT Noted — I'll fold that into the checkout work. The payment logic stays in " +
        "${BOLD}lib/payments.ts$RESET, so it's a small, contained change.",
    "$TEXT_DOT Good call. I'll adjust the checkout steps to cover that and re-run the tests " +
        "to make sure nothing regresses.",
    "$TEXT_DOT Got it — I'll take a look and keep the changes scoped to the checkout flow."
)

internal fun DemoServer.claudeRespond(id: String) {
    val term = demoTerminal(id) ?: return
    val project = term.project
    val ack = claudeAcks[term.ackCount % claudeAcks.size]
    updateTerminal(id) {
        it.responding = true
        it.ackCount += 1
    }
    demoSetAgentStatus(project = project, entries = listOf(statusEntry(id, "Running", 10)))
    emit(id, "\r\n")
    pushAfter(1.1) {
        if (demoTerminal(id) == null) return@pushAfter null
        val text = ack + "\r\n\r\n$BOLD>$RESET "
        appendBuffer(id, text)
        updateTerminal(id) { it.responding = false }
        demoSetAgentStatus(project = project, entries = listOf(statusEntry(id, "Waiting", 30)))
        push(mapOf("t" to "o", "id" to id, "d" to text))
        flushQueuedClaude(id)
        null
    }
}

internal fun DemoServer.startClaudeScript(id: String) {
    val term = demoTerminal(id) ?: return
    if (term.scriptStarted) return
    updateTerminal(id) { it.scriptStarted = true }
    val project = term.project
    demoSetAgentStatus(project = project, entries = listOf(statusEntry(id, "Running", 10)))
    val steps = claudeScriptSteps
    steps.forEachIndexed { i, (at, text) ->
        val last = i == steps.lastIndex
        pushAfter(at) {
            if (demoTerminal(id) == null) return@pushAfter null
            appendBuffer(id, text)
            if (!last) return@pushAfter mapOf("t" to "o", "id" to id, "d" to text)
            updateTerminal(id) { it.scriptFinished = true }
            demoSetAgentStatus(project = project, entries = listOf(statusEntry(id, "Waiting", 30)))
            push(mapOf("t" to "o", "id" to id, "d" to text))
            flushQueuedClaude(id)
            null
        }
    }
}

private val claudeScriptSteps: List<Pair<Double, String>> = listOf(
    0.9 to "$DIM> Implement the checkout redesign: split the form into shipping and payment " +
        "steps, and move the payment logic into lib/payments.ts$RESET\r\n\r\n",
    2.6 to "$TEXT_DOT I'll look at the current checkout implementation first.\r\n\r\n",
    4.8 to "$TOOL_DOT ${BOLD}Read$RESET(app/checkout/page.tsx)\r\n" +
        "  $DIM⎿  Read 148 lines$RESET\r\n\r\n",
    7.2 to "$TOOL_DOT ${BOLD}Read$RESET(components/CheckoutForm.tsx)\r\n" +
        "  $DIM⎿  Read 214 lines$RESET\r\n\r\n",
    10.5 to "$TEXT_DOT The form validates and charges the card inline. I'll extract that into " +
        "a new lib/payments.ts module, then split the form into a shipping step and a " +
        "payment step.\r\n\r\n",
    14.0 to "$TOOL_DOT ${BOLD}Write$RESET(lib/payments.ts)\r\n" +
        "  $DIM⎿  Created lib/payments.ts with 86 lines$RESET\r\n\r\n",
    18.5 to "$TOOL_DOT ${BOLD}Update$RESET(components/CheckoutForm.tsx)\r\n" +
        "  $DIM⎿  Updated components/CheckoutForm.tsx with 42 additions and 18 removals$RESET\r\n" +
        "     $RED-  const charge = await fetch(\"/api/charge\", …)$RESET\r\n" +
        "     $GREEN+  const intent = await createPaymentIntent(cart)$RESET\r\n\r\n",
    23.0 to "$TOOL_DOT ${BOLD}Update$RESET(app/checkout/page.tsx)\r\n" +
        "  $DIM⎿  Updated app/checkout/page.tsx with 9 additions and 3 removals$RESET\r\n\r\n",
    27.5 to "$TOOL_DOT ${BOLD}Bash$RESET(npm test)\r\n" +
        "  $DIM⎿  3 test files, 23 tests passed (1.2s)$RESET\r\n\r\n",
    31.0 to "$TOOL_DOT ${BOLD}Update$RESET(README.md)\r\n" +
        "  $DIM⎿  Updated README.md with 6 additions$RESET\r\n\r\n",
    35.0 to "$TEXT_DOT Done — checkout is now a two-step flow:\r\n\r\n" +
        "  • ${BOLD}lib/payments.ts$RESET — payment intent creation and card validation\r\n" +
        "  • ${BOLD}components/CheckoutForm.tsx$RESET — shipping and payment steps\r\n" +
        "  • ${BOLD}app/checkout/page.tsx$RESET — wires up the step state\r\n" +
        "  • ${BOLD}README.md$RESET — documents the new flow\r\n\r\n" +
        "  All 23 tests pass. Want me to update the cart badge to match the new flow?\r\n\r\n",
    37.0 to "\u001B[?2004h$DIM────────────────────────────────────$RESET\r\n" +
        "$BOLD>$RESET "
)
