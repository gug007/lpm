package cx.lpm.mobile.core.model

/**
 * What a plain-text log line reports, judged as the desktop judges it (logSeverity.ts,
 * iOS `LogSeverity`): by the shapes dev servers, build tools and loggers print errors
 * and warnings in. Keep the patterns in step with it.
 */
enum class LogSeverity {
    ERROR,
    WARNING;

    companion object {
        private val IGNORE_CASE = setOf(RegexOption.IGNORE_CASE)

        private val NOTHING_WRONG =
            Regex("""\b(?:0|no|zero|without)\s+(?:errors?|warnings?|problems?)\b""", IGNORE_CASE)

        private val ERROR_PATTERNS = listOf(
            Regex("""\b(?:ERROR|FATAL|CRITICAL|PANIC|EMERG)\b|\bERR!"""),
            Regex(
                """\blevel["']?\s*[=:]\s*["']?(?:error|err|fatal|critical|panic)\b""",
                IGNORE_CASE
            ),
            Regex(
                """^\s*(?:\[(?:error|fatal)\]|\((?:error|fatal)\)|(?:error|fatal)(?:\[[A-Z]?\d+\])?(?::|\s{2,}|\s-\s))""",
                IGNORE_CASE
            ),
            Regex("""^\s*[⨯✖✗✘×]\s"""),
            Regex("""^\s*\d+:\d+\s+error\s{2}"""),
            Regex("""\berror(?:\[[A-Z]?\d+\])?:"""),
            Regex("""\berror TS\d+\b"""),
            Regex("""(?:^|\s)Error:"""),
            Regex("""\b[A-Z][A-Za-z0-9_]*(?:Error|Exception)\b(?::|\s\(|$)"""),
            Regex("""^[A-Z]\w*(?:::[A-Z]\w*)+ \("""),
            Regex("""^Traceback \(most recent call last\)"""),
            Regex("""^panic: |^thread '.*' panicked at """),
            Regex("""\bUnhandled ?(?:Promise ?)?Rejection|\bUncaught\b"""),
            Regex("""\bCompleted 5\d\d\b"""),
            Regex(
                """\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+(?:\s+HTTP/[\d.]+")?\s+5\d\d\b"""
            )
        )

        private val WARNING_PATTERNS = listOf(
            Regex("""\b(?:WARN|WARNING)\b"""),
            Regex("""\blevel["']?\s*[=:]\s*["']?(?:warn|warning)\b""", IGNORE_CASE),
            Regex(
                """^\s*(?:\[(?:warn|warning)\]|\((?:warn|warning)\)|(?:warn|warning)(?::|\s{2,}|\s-\s))""",
                IGNORE_CASE
            ),
            Regex("""^\s*\d+:\d+\s+warning\s{2}"""),
            Regex("""\bwarning(?:\[[\w-]+\])?:"""),
            Regex("""(?:^|[\s)])Warning:"""),
            Regex("""\b[A-Z][A-Za-z0-9_]*Warning\b"""),
            Regex("""⚠""")
        )

        /** A word or mark every pattern above needs, so one test rules out most lines. */
        private val MIGHT_REPORT = Regex(
            """err|fatal|crit|panic|emerg|exception|traceback|unhandled|uncaught|warn|::|5\d\d|[⚠⨯✖✗✘×]""",
            IGNORE_CASE
        )

        private val STACK_FRAME = Regex("""^\s+at\s""")
        private val STACK_LINE =
            Regex("""^\s+\S|^\s*(?:at |File "|from |Caused by:|\.\.\. \d+ more)""")

        private const val MAX_STACK_LINES = 30

        /** What [line] reports; stack frames under an error are not errors of their own. */
        fun of(line: String): LogSeverity? {
            if (!MIGHT_REPORT.containsMatchIn(line) || STACK_FRAME.containsMatchIn(line) ||
                NOTHING_WRONG.containsMatchIn(line)
            ) {
                return null
            }
            return when {
                ERROR_PATTERNS.any { it.containsMatchIn(line) } -> ERROR
                WARNING_PATTERNS.any { it.containsMatchIn(line) } -> WARNING
                else -> null
            }
        }

        /** The lines of [text], without line endings. */
        fun lines(text: String): List<String> = text.split("\n").map { it.removeSuffix("\r") }

        /**
         * The errors in [lines], one block of line indices per report: an error line
         * with the stack printed under it.
         */
        fun errorBlocks(lines: List<String>): List<List<Int>> {
            val blocks = mutableListOf<MutableList<Int>>()
            var stack = 0
            lines.forEachIndexed { i, raw ->
                val line = raw.trimEnd()
                val blank = line.isBlank()
                val found = if (blank) null else of(line)
                when {
                    found == ERROR -> {
                        blocks += mutableListOf(i)
                        stack = MAX_STACK_LINES
                    }

                    found == null && stack > 0 && !blank && STACK_LINE.containsMatchIn(line) -> {
                        blocks.last() += i
                        stack--
                    }

                    else -> stack = 0
                }
            }
            return blocks
        }
    }
}
