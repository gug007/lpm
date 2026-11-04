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
 * The user's lpm skills in the composer, like the desktop's: picked, one goes in like
 * the agent's own as `/name ` to send or add arguments to, and sending `/name args`
 * runs it. The Mac that holds the project works out what to send.
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

    /**
     * A skill picked mid-message: what the agent reads there takes the fragment's place,
     * its own call for the skill when it can run it, else the prompt. False for one alone
     * in the message, which goes in like the agent's own commands.
     */
    fun pick(command: SlashCommand, cli: String): Boolean {
        if (WHOLE_COMMAND.matches(field.text)) return false
        // The "/" may be gone by the time the text comes: it then goes after the message.
        expand(command.name, args = "", cli) { expanded ->
            field.replace(field.text.substringBeforeLast('/') + expanded.text + " ")
        }
        return true
    }

    /** Runs the field's `/name args` when it names one of the user's [commands], else false. */
    fun runTyped(commands: List<SlashCommand>, cli: String): Boolean {
        val run = lpmRunOf(field.text, commands) ?: return false
        run(run.name, run.args, cli)
        return true
    }

    // It goes to the agent as a skill when the agent can start one, else as its prompt
    // like a typed message, every variable given; one still unfilled leaves the prompt
    // in the field to finish by hand.
    private fun run(name: String, args: String, cli: String) = expand(name, args, cli) { expanded ->
        field.replace(expanded.text)
        if (expanded.missing.isEmpty()) {
            field.send()
        } else {
            mutableNotice.value =
                CommandNotice.FillIn(expanded.missing.joinToString(", ") { "{{$it}}" })
        }
    }

    private fun expand(name: String, args: String, cli: String, then: (ExpandedCommand) -> Unit) {
        val store = store ?: return
        expanding = true
        scope.launch {
            val outcome = store.expand(project, name, args, cli)
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
