package cx.lpm.mobile.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServiceCrashPromptTest {
    private val nodeCrash = """
        worker ready — waiting for jobs
        jobs/receipt.ts:42
          const total = formatMoney(order.totals.grand)
                                                 ^

        TypeError: Cannot read properties of undefined (reading 'grand')
            at sendReceipt (jobs/receipt.ts:42:41)
            at processJob (jobs/worker.ts:88:11)

        Node.js v22.11.0
    """.trimIndent()

    @Test
    fun `lines read as the desktop reads them`() {
        assertEquals(
            LogSeverity.ERROR,
            LogSeverity.of("TypeError: Cannot read properties of undefined")
        )
        assertEquals(LogSeverity.ERROR, LogSeverity.of("Traceback (most recent call last):"))
        assertEquals(LogSeverity.ERROR, LogSeverity.of("thread 'main' panicked at src/main.rs:4:5"))
        assertEquals(LogSeverity.ERROR, LogSeverity.of("GET /api/cart 500 in 12ms"))
        assertEquals(LogSeverity.WARNING, LogSeverity.of("WARN deprecated option"))
        assertNull(LogSeverity.of("    at sendReceipt (jobs/receipt.ts:42:41)"))
        assertNull(LogSeverity.of("Compiled with 0 errors"))
        assertNull(LogSeverity.of("GET / 200 in 41ms"))
    }

    @Test
    fun `an error's block takes the stack under it`() {
        val lines = LogSeverity.lines(nodeCrash)
        assertEquals(listOf(listOf(5, 6, 7)), LogSeverity.errorBlocks(lines))
    }

    @Test
    fun `a crash with an error quotes it with its stack`() {
        assertEquals(
            """
            The `worker` service in this project, started with `npm run worker`, exited with code 1. It logged this error:

            ```
            TypeError: Cannot read properties of undefined (reading 'grand')
                at sendReceipt (jobs/receipt.ts:42:41)
                at processJob (jobs/worker.ts:88:11)
            ```

            Find the cause in the code and fix it.
            """.trimIndent(),
            ServiceCrashPrompt.text("worker", "npm run worker", 1, nodeCrash)
        )
    }

    @Test
    fun `the same error logged again counts, and the latest three are kept`() {
        val log = listOf(
            "Error: a",
            "Error: b",
            "Error: a",
            "Error: c",
            "Error: d"
        ).joinToString("\n")
        val prompt = ServiceCrashPrompt.text("api", "", 2, log)
        assertEquals(
            """
            The `api` service in this project exited with code 2. It logged these errors, the latest last:

            ```
            Error: a
            (logged 2 times)

            Error: c

            Error: d
            ```

            Find the cause in the code and fix it.
            """.trimIndent(),
            prompt
        )
    }

    @Test
    fun `a crash with no error lines quotes how its output ended`() {
        val prompt = ServiceCrashPrompt.text("web", "npm run dev", 137, "starting\nKilled\n\n")
        assertEquals(
            """
            The `web` service in this project, started with `npm run dev`, exited with code 137. The last lines it printed:

            ```
            starting
            Killed
            ```

            Find the cause in the code and fix it.
            """.trimIndent(),
            prompt
        )
    }

    @Test
    fun `a crash with no output says only how it ended`() {
        assertEquals(
            "The `web` service in this project exited with code 1.\n\nFind the cause in the code and fix it.",
            ServiceCrashPrompt.text("web", "", 1, "")
        )
    }
}
