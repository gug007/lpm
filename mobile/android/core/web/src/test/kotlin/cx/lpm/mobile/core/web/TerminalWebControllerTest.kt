package cx.lpm.mobile.core.web

import androidx.compose.ui.unit.dp
import java.util.Base64
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalWebControllerTest {
    private val queue = ArrayDeque<() -> Unit>()
    private val surface = FakeSurface()
    private val events = mutableListOf<String>()
    private val controller = TerminalWebController { queue.addLast(it) }.apply {
        callbacks = TerminalCallbacks(
            onInput = { events += "input:$it" },
            onResize = { cols, rows -> events += "resize:${cols}x$rows" },
            onFirstContent = { events += "firstContent" },
            onOpenPath = { paths, line -> events += "openPath:${paths.joinToString(",")}:$line" },
            onOpenUrl = { events += "openUrl:$it" },
            onRevive = { events += "revive" },
            onPageRestart = { events += "reseed" },
            onSelection = { events += "selection:$it" }
        )
        attach(surface)
    }

    private fun send(name: String, body: String? = null) {
        controller.onMessage(PageMessage(name, body?.let(Json::parseToJsonElement) ?: JsonNull))
    }

    private fun send(name: String, body: JsonElement) =
        controller.onMessage(PageMessage(name, body))

    private fun runQueue() {
        while (queue.isNotEmpty()) queue.removeFirst()()
    }

    private fun decoded(script: String): String {
        val b64 = script.substringAfter("('").substringBefore("'")
        return String(Base64.getDecoder().decode(b64), Charsets.UTF_8)
    }

    @Test
    fun findAsksThePageAndKeepsWhatItReports() {
        send("ready", "{}")
        surface.scripts.clear()

        controller.find("dev/store", FindStep.Type)
        controller.find("dev/store", FindStep.Prev)
        val query = surface.scripts[0].substringAfter("('").substringBefore("'")
        assertEquals("dev/store", String(Base64.getDecoder().decode(query), Charsets.UTF_8))
        assertTrue(surface.scripts[0].endsWith(", 'type')"))
        assertTrue(surface.scripts[1].endsWith(", 'prev')"))

        send("find", """{"index":2,"count":5}""")
        assertEquals(2, controller.findIndex)
        assertEquals(5, controller.findCount)

        controller.clearFind()
        assertEquals("window.lpmFindClear()", surface.scripts.last())
        assertEquals(-1, controller.findIndex)
        assertEquals(0, controller.findCount)
    }

    @Test
    fun readyAppliesInsetsFontAndThemeBeforeThePendingSeed() {
        controller.applyHiddenInsets(0, 120)
        controller.applyFontSize(14)
        controller.applyTheme(TerminalTheme.Nord)
        controller.seed("old", reset = true, ptyCols = 0, ptyRows = 0)
        controller.seed("snapshot", reset = true, ptyCols = 0, ptyRows = 0)
        controller.feed(" more")
        assertTrue(surface.scripts.isEmpty())

        send("ready", "{}")

        assertEquals("window.lpmSetInsets(0, 120)", surface.scripts[0])
        assertEquals("window.lpmSetFontSize(14)", surface.scripts[1])
        assertEquals(TerminalScripts.setTheme(TerminalTheme.Nord), surface.scripts[2])
        assertEquals("snapshot", decoded(surface.scripts[3]))
        assertEquals(" more", decoded(surface.scripts[4]))
        assertEquals(5, surface.scripts.size)
        assertTrue(controller.isReady)
        assertEquals(listOf("firstContent"), events)
        assertEquals(TerminalTheme.Nord, surface.ground)
    }

    @Test
    fun outputIsCoalescedIntoOneWritePerTurn() {
        send("ready")
        surface.scripts.clear()
        controller.feed("a")
        controller.feed("é")
        controller.feed("😀\r\n")
        assertTrue(surface.scripts.isEmpty())
        runQueue()
        assertEquals(listOf("aé😀\r\n"), surface.scripts.map(::decoded))
        runQueue()
        assertEquals(1, surface.scripts.size)
    }

    @Test
    fun aResettingSeedDropsBufferedOutputAndAMissedSliceIsFed() {
        send("ready")
        surface.scripts.clear()
        controller.feed("stale")
        controller.seed("screen", reset = true, ptyCols = 0, ptyRows = 0)
        runQueue()
        assertEquals(listOf("window.lpmSeed"), surface.scripts.map { it.substringBefore("(") })
        controller.seed("missed", reset = false, ptyCols = 0, ptyRows = 0)
        runQueue()
        assertEquals("missed", decoded(surface.scripts.last()))
        assertTrue(surface.scripts.last().startsWith("window.lpmFeed("))
    }

    @Test
    fun unchangedValuesAreNotPushedAgain() {
        send("ready")
        surface.scripts.clear()
        controller.applyHiddenInsets(0, 0)
        controller.applyFontSize(TerminalPrefs.DEFAULT_FONT_SIZE)
        controller.applyTheme(TerminalPrefs.DefaultTheme)
        assertTrue(surface.scripts.isEmpty())
        controller.applyHiddenInsets(10, 0)
        controller.applyFontSize(16)
        controller.applyTheme(TerminalTheme.Dracula)
        assertEquals(3, surface.scripts.size)
    }

    @Test
    fun pageMessagesReachTheCallbacks() {
        send("input", JsonPrimitive("ls\r"))
        send("resize", """{"cols":54,"rows":38}""")
        send("openPath", """{"paths":["app/page.tsx","page.tsx"],"line":42}""")
        send("openPath", """{"paths":["a.ts"]}""")
        send("openPath", """{"paths":[]}""")
        send("openURL", JsonPrimitive("https://lpm.cx/docs"))
        send("openURL", JsonPrimitive("HTTP://example.com"))
        send("openURL", JsonPrimitive("javascript:alert(1)"))
        send("openURL", JsonPrimitive("file:///etc/passwd"))
        send("resize", """{"cols":"54","rows":38}""")
        send("unknown", "{}")
        assertEquals(
            listOf(
                "input:ls\r",
                "resize:54x38",
                "openPath:app/page.tsx,page.tsx:42",
                "openPath:a.ts:0",
                "openUrl:https://lpm.cx/docs",
                "openUrl:HTTP://example.com"
            ),
            events
        )
    }

    @Test
    fun aHoldsSelectionReachesTheScreen() {
        send("selection", """{"action":"began"}""")
        send("selection", """{"action":"copy","text":"npm test"}""")
        send("selection", """{"action":"prompt","text":"line 1\nline 2"}""")
        send("selection", """{"action":"find","text":"Error"}""")
        send("selection", """{"action":"copy"}""")
        send("selection", """{"action":"all","text":"x"}""")
        send("selection", JsonPrimitive("copy"))
        assertEquals(
            listOf(
                "selection:Began",
                "selection:Copy(text=npm test)",
                "selection:Prompt(text=line 1\nline 2)",
                "selection:Find(text=Error)"
            ),
            events
        )
    }

    @Test
    fun extentUpdatesTheTextExtent() {
        val extent = TextExtent()
        controller.textExtent = extent
        send("extent", """{"bottom":412.5,"fills":false}""")
        assertEquals(412.5.dp, extent.bottom)
        assertFalse(extent.fillsOnGrow)
        send("extent", """{"bottom":30}""")
        assertEquals(30.dp, extent.bottom)
        assertTrue(extent.fillsOnGrow)
    }

    @Test
    fun gainingControlResendsTheFittedSize() {
        controller.controlChanged(controlled = true)
        assertTrue(events.isEmpty())
        send("resize", """{"cols":54,"rows":38}""")
        events.clear()
        controller.controlChanged(controlled = true)
        controller.controlChanged(controlled = false)
        assertTrue(events.isEmpty())
        controller.controlChanged(controlled = true)
        assertEquals(listOf("resize:54x38"), events)
    }

    @Test
    fun aSeedAtAnotherSizeReassertsThePhonesSize() {
        controller.seed("x", reset = true, ptyCols = 80, ptyRows = 24)
        assertTrue(events.isEmpty())
        send("resize", """{"cols":54,"rows":38}""")
        events.clear()
        controller.seed("x", reset = true, ptyCols = 54, ptyRows = 38)
        assertTrue(events.isEmpty())
        controller.seed("x", reset = true, ptyCols = 80, ptyRows = 24)
        assertEquals(listOf("resize:54x38"), events)
    }

    @Test
    fun submitSendsBase64() {
        controller.submit("fix the \"build\"\nnow")
        assertEquals("fix the \"build\"\nnow", decoded(surface.scripts.single()))
        assertTrue(surface.scripts.single().startsWith("window.lpmSubmit('"))
    }

    @Test
    fun captureReturnsThePagesText() = runTest {
        surface.result = "\"line 1\\nline 2\""
        assertEquals("line 1\nline 2", controller.capture(50))
        assertEquals("window.lpmCapture(50)", surface.scripts.last())
        controller.detach(surface)
        assertEquals("", controller.capture(50))
    }

    @Test
    fun comingBackFromTheBackgroundRevives() {
        controller.foreground()
        assertTrue(events.isEmpty())
        controller.background()
        controller.foreground()
        assertEquals(listOf("revive"), events)
        assertFalse(surface.scripts.contains(TerminalScripts.REVIVE))
        send("ready")
        events.clear()
        controller.background()
        controller.foreground()
        assertEquals(listOf("revive"), events)
        assertEquals(TerminalScripts.REVIVE, surface.scripts.last())
        assertEquals(listOf("resume", "pause", "resume", "pause", "resume"), surface.lifecycle)
    }

    @Test
    fun aLostPageIsRebuiltAndReseeded() {
        send("ready")
        controller.applyFontSize(16)
        val generation = controller.generation
        controller.feed("pending")
        controller.pageLost()
        assertEquals(generation + 1, controller.generation)
        assertFalse(controller.isReady)
        assertEquals(listOf("reseed"), events)

        val fresh = FakeSurface()
        controller.detach(surface)
        controller.attach(fresh)
        controller.seed("snapshot", reset = true, ptyCols = 132, ptyRows = 40)
        controller.onMessage(PageMessage("ready"))
        runQueue()
        assertEquals("window.lpmSetFontSize(16)", fresh.scripts[1])
        assertEquals("snapshot", decoded(fresh.scripts.last()))
        assertTrue(fresh.scripts.last().endsWith("', 132)"))
    }

    @Test
    fun keyboardCallsReachTheSurface() {
        controller.focus()
        controller.hideKeyboard()
        assertEquals(listOf("focus", "blur"), surface.lifecycle)
    }

    private class FakeSurface : TerminalSurface {
        val scripts = mutableListOf<String>()
        val lifecycle = mutableListOf<String>()
        var ground: TerminalTheme? = null
        var result: String? = null

        override fun evaluate(script: String, result: ((String?) -> Unit)?) {
            scripts += script
            result?.invoke(this.result)
        }

        override fun setBackground(theme: TerminalTheme) {
            ground = theme
        }

        override fun focusInput() {
            lifecycle += "focus"
        }

        override fun blurInput() {
            lifecycle += "blur"
        }

        override fun pause() {
            lifecycle += "pause"
        }

        override fun resume() {
            lifecycle += "resume"
        }
    }
}
