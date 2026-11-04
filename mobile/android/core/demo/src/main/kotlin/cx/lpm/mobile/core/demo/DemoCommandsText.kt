package cx.lpm.mobile.core.demo

// How the demo Mac reads a command's prompt, as lpm_commands_expand.rs does:
// `{{name}}` variables, the `<a> <b>` hint, and the words a run gives.

internal val AUTO_VARIABLES = listOf("branch", "project", "dir")

/** The variables a run has to be given, as the `<a> <b>` hint after `/name `. */
internal fun commandArgumentHint(body: String): String {
    val asks = commandVariables(body).filter { it !in AUTO_VARIABLES }
    if (asks.isEmpty() && "\$ARGUMENTS" in body) return "<arguments>"
    return asks.joinToString(" ") { "<$it>" }
}

/** Each `{{name}}` in a prompt, once, in the order they first appear. */
internal fun commandVariables(body: String): List<String> {
    val out = mutableListOf<String>()
    replaceCommandVariables(body) { variable ->
        if (variable !in out) out += variable
        null
    }
    return out
}

/** `n` values from the arguments: a word each, the last taking the rest. */
internal fun positionalArguments(args: String, n: Int): List<String> {
    val out = mutableListOf<String>()
    var rest = args.trimmingWhitespacesAndNewlines()
    while (out.size + 1 < n && rest.isNotEmpty()) {
        val end = rest.indexOfFirst { it.isWhitespace() }.takeIf { it >= 0 } ?: rest.length
        out += rest.substring(0, end)
        rest = rest.substring(end).dropWhile { it.isWhitespace() }
    }
    if (n > 0 && rest.isNotEmpty()) out += rest
    return out
}

/**
 * Every `{{name}}` rewritten with what [value] gives, the token left as it was when it
 * gives nothing.
 */
internal fun replaceCommandVariables(body: String, value: (String) -> String?): String {
    val out = StringBuilder()
    var rest = body
    while (true) {
        val open = rest.indexOf("{{")
        if (open < 0) break
        out.append(rest, 0, open)
        val after = rest.substring(open + 2)
        val close = after.indexOf("}}")
        if (close < 0) {
            out.append(rest, open, rest.length)
            return out.toString()
        }
        val variable = after.substring(0, close).trimmingWhitespacesAndNewlines()
        val isName = variable.isNotEmpty() && variable.all { it.isVariableChar() }
        val filled = if (isName) value(variable) else null
        if (filled != null) out.append(filled) else out.append(rest, open, open + 2 + close + 2)
        rest = after.substring(close + 2)
    }
    out.append(rest)
    return out.toString()
}

private fun Char.isVariableChar(): Boolean =
    this in 'a'..'z' || this in 'A'..'Z' || this in '0'..'9' || this == '_' || this == '-'
