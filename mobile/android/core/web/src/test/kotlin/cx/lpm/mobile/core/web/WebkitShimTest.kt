package cx.lpm.mobile.core.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WebkitShimTest {
    private val terminal = WebkitShim.script(TerminalScripts.handlers)

    @Test
    fun registersExactlyTheTerminalHandlersIosRegisters() {
        assertEquals(
            listOf(
                "input",
                "resize",
                "ready",
                "openPath",
                "openURL",
                "extent",
                "find",
                "selection"
            ),
            TerminalScripts.handlers
        )
        assertTrue(
            terminal.contains(
                """for (const name of ["input","resize","ready","openPath","openURL","extent","find","selection"])"""
            )
        )
    }

    @Test
    fun definesWindowWebkitMessageHandlersOverTheInjectedBridge() {
        assertEquals("lpmBridge", WebkitShim.BRIDGE_OBJECT)
        assertTrue(terminal.contains("const bridge = window.lpmBridge;"))
        assertTrue(terminal.contains("if (!bridge || window.webkit) return;"))
        assertTrue(terminal.contains("Object.defineProperty(window, 'webkit', {"))
        assertTrue(
            terminal.contains(
                "value: Object.freeze({ messageHandlers: Object.freeze(messageHandlers) }),"
            )
        )
    }

    @Test
    fun postsOneJsonEnvelopePerMessage() {
        assertTrue(
            terminal.contains(
                "bridge.postMessage(JSON.stringify(body === undefined ? { name } : { name, body }));"
            )
        )
    }

    @Test
    fun handlerNamesAreWrittenAsStringLiterals() {
        val script = WebkitShim.script(listOf("link", "a\"b\\c\n"))
        assertTrue(script.contains("""["link","a\"b\\c\n"]"""))
    }

    @Test
    fun isOneStatement() {
        assertTrue(terminal.startsWith("(() => {"))
        assertTrue(terminal.endsWith("})();"))
    }
}
