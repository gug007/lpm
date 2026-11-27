package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What the commit sheet's hook panel shows and what a Fix with … agent is told. */
class CommitHookFailureTest {
    private fun jsonObject(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private fun failure(output: String, summary: String? = null) =
        CommitHookFailure("pre-commit", summary, output, emptyList())

    @Test
    fun parseNeedsTheHooksName() {
        assertNull(CommitHookFailure.parse(null))
        assertNull(CommitHookFailure.parse(jsonObject("""{ "output": "x" }""")))
        assertEquals(
            CommitHookFailure("pre-commit", null, "x", listOf("a.ts")),
            CommitHookFailure.parse(
                jsonObject(
                    """{ "hook": "pre-commit", "summary": "", "output": "x",
                         "changed": ["a.ts"] }"""
                )
            )
        )
        assertEquals(
            "a list with anything but paths reads as none, as Swift's `as? [String]`",
            emptyList<String>(),
            CommitHookFailure.parse(jsonObject("""{ "hook": "h", "changed": ["a", 1] }"""))
                ?.changed
        )
    }

    @Test
    fun thePreviewShowsTheLinesThatReportSomething() {
        val output = listOf(
            "[STARTED] Preparing lint-staged...",
            "  [COMPLETED] Running tasks...",
            "",
            "/repo/src/a.ts",
            "  3:1  warning  Unexpected console",
            "  9:5  error  'x' is never used",
            "✖ 2 problems (1 error, 1 warning)",
            "husky - pre-commit hook exited with code 1 (error)"
        ).joinToString("\n")
        val f = failure(output)
        assertEquals(
            listOf(
                "  3:1  warning  Unexpected console",
                "  9:5  error  'x' is never used",
                "✖ 2 problems (1 error, 1 warning)"
            ),
            f.preview
        )
        assertEquals(8, f.lineCount)
    }

    @Test
    fun withNothingReportedThePreviewIsTheLastSixLines() {
        val output = (1..9).joinToString("\n") { "step $it" } + "\n\t\n"
        val f = failure(output)
        assertEquals((4..9).map { "step $it" }, f.preview)
        assertEquals(11, f.lineCount)
        assertEquals(0, failure("").lineCount)
        assertEquals(emptyList<String>(), failure("").preview)
    }

    @Test
    fun theFindingsShownStopAtSix() {
        val output = (1..8).joinToString("\n") { "src/a.ts:$it:1 error" }
        assertEquals((1..6).map { "src/a.ts:$it:1 error" }, failure(output).preview)
    }

    @Test
    fun thePromptNamesTheCommitWhatItPrintedAndTheFiles() {
        val f = failure("line one\nline two", summary = "eslint · 3 errors in src/a.ts")
        assertEquals(
            """
            I tried to commit with the message "feat: checkout", and the pre-commit hook stopped it. It found: eslint · 3 errors in src/a.ts. What it printed:

            ```
            line one
            line two
            ```

            Fix what it found, then commit the same files again with the same message. Let the hook run: don't skip it with --no-verify.

            Files in the commit:
            - src/a.ts
            - src/b.ts
            """.trimIndent(),
            f.prompt("  feat: checkout\n\nWith a body\n", listOf("src/a.ts", "src/b.ts"))
        )
    }

    @Test
    fun thePromptKeepsTheLastLinesAndListsThirtyFiles() {
        val output = (1..130).joinToString("\n") { "l$it" }
        val files = (1..32).map { "f$it.ts" }
        val prompt = failure(output).prompt("fix", files)
        val lines = prompt.split("\n")
        assertEquals(
            "I tried to commit with the message \"fix\", and the pre-commit hook stopped it. " +
                "What it printed:",
            lines[0]
        )
        assertEquals("l11", lines[3])
        assertEquals("l130", lines[122])
        assertEquals("- f30.ts", lines[lines.size - 2])
        assertEquals("- and 2 more", lines.last())
        assertEquals(
            "no files, no list",
            false,
            failure("x").prompt("fix", emptyList()).contains("Files in the commit:")
        )
    }
}
