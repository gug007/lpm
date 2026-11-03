package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.model.CommandRun
import cx.lpm.mobile.core.model.ExpandedCommand
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.core.model.parseCommandRun
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Why a command didn't simply go: values still to fill in, or the Mac's sentence. */
sealed interface CommandNotice {
    /** `{{ticket}}, {{who}}`: the variables left in the prompt now in the field. */
    data class FillIn(val variables: String) : CommandNotice

    data class Failed(val error: String) : CommandNotice
}

/** The field a command run writes to, and Send. */
internal interface CommandField {
    val text: String

    fun replace(text: String)

    /** Sends what the field holds now, as Send does. */
    fun send()
}

/**
 * The user's lpm commands in the composer, like the desktop's: picked on a message
 * that is just the command, one runs (or leaves `/name ` when it asks for
 * arguments); picked mid-message, its prompt takes the fragment's place; and sending
 * `/name args` runs it. The Mac that holds the project fills the prompt in.
 */
internal class ComposerLpmCommands(
    private val store: LpmCommandsStore?,
    private val project: String,
    private val scope: CoroutineScope,
    private val reloadMenu: () -> Unit,
    private val field: CommandField
) {
    private val mutableNotice = MutableStateFlow<CommandNotice?>(null)
    val notice: StateFlow<CommandNotice?> = mutableNotice.asStateFlow()

    /** A prompt is out to the Mac; Send waits for it. */
    var expanding = false
        private set

    // The store's revision the `/` list was last fetched at.
    private var menuRevision = 0

    fun dismissNotice() {
        mutableNotice.value = null
    }

    /** They run in a terminal with its tools whose agent [cli] is known, on a Mac keeping them. */
    fun runHere(terminalTools: Boolean, cli: String): Boolean =
        terminalTools && cli.isNotEmpty() && store?.available == true

    /** The `/` menu opened: fetch its rows again when a command changed since they came. */
    fun menuOpened() {
        val revision = store?.state?.value?.revision ?: return
        if (revision == menuRevision) return
        menuRevision = revision
        reloadMenu()
    }

    fun pick(command: SlashCommand) {
        val text = field.text
        val whole = WHOLE_COMMAND.matches(text)
        when {
            whole && command.argumentHint.isNotEmpty() ->
                field.replace(replacingFragment(text, '/', "/${command.name} "))

            whole -> run(command.name, args = "")

            // The "/" may be gone by the time the prompt comes: it then goes after the text.
            else -> expand(command.name, args = "") { expanded ->
                field.replace(field.text.substringBeforeLast('/') + expanded.text)
            }
        }
    }

    /** Runs the field's `/name args` when it names one of the user's [commands], else false. */
    fun runTyped(commands: List<SlashCommand>): Boolean {
        val run = lpmRunOf(field.text, commands) ?: return false
        run(run.name, run.args)
        return true
    }

    // Every variable given, the prompt goes like a typed message; one still unfilled
    // leaves the prompt in the field to finish by hand.
    private fun run(name: String, args: String) = expand(name, args) { expanded ->
        field.replace(expanded.text)
        if (expanded.missing.isEmpty()) {
            field.send()
        } else {
            mutableNotice.value =
                CommandNotice.FillIn(expanded.missing.joinToString(", ") { "{{$it}}" })
        }
    }

    private fun expand(name: String, args: String, then: (ExpandedCommand) -> Unit) {
        val store = store ?: return
        expanding = true
        scope.launch {
            val outcome = store.expand(project, name, args)
            expanding = false
            when (outcome) {
                is CommandOutcome.Done -> then(outcome.value)

                is CommandOutcome.Failed ->
                    mutableNotice.value =
                        CommandNotice.Failed(outcome.error)
            }
        }
    }

    private companion object {
        // A message that is nothing but a "/fragment" being typed.
        val WHOLE_COMMAND = Regex("^\\s*/[A-Za-z0-9:_-]*\\s*$")
    }
}

/** The `/name args` [text] is when it runs one of the user's lpm commands among [commands]. */
internal fun lpmRunOf(text: String, commands: List<SlashCommand>): CommandRun? {
    val run = parseCommandRun(text) ?: return null
    val command = commands.firstOrNull { it.isLpm && it.name.equals(run.name, ignoreCase = true) }
    return command?.let { CommandRun(it.name, run.args) }
}
