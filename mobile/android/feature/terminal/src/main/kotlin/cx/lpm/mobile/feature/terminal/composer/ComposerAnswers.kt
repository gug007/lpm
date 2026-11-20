package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.feature.terminal.R
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/** The answers other than text a terminal's composer offers, and the one picked. */
data class ComposerAnswer(
    /** Each kind the terminal's agent can make. */
    val offers: Map<AnswerKind, AnswerOffer> = emptyMap(),
    /** What the next prompt asks the agent for instead of a text answer. */
    val kind: AnswerKind? = null
)

/**
 * Answers other than text in one terminal's composer: a video where its agent's command
 * list holds the skill, an image wherever an agent runs, and which one the
 * next prompt asks for.
 */
internal class ComposerAnswers(
    private val target: ComposerTarget,
    private val session: MacSession?,
    private val store: ComposerStore?
) {
    private val terminals = session?.store<TerminalsStore>()
    private val projects = session?.store<ProjectsStore>()

    val state: Flow<ComposerAnswer> = combine(
        store?.state?.map { it.answer }?.distinctUntilChanged() ?: flowOf(null),
        terminals?.state ?: flowOf(null),
        session?.state?.map { it.activeRecord?.isMac != false }?.distinctUntilChanged()
            ?: flowOf(true),
        projects?.state?.map { it.project(target.project)?.isRemote == true }
            ?.distinctUntilChanged() ?: flowOf(false),
        ::answer
    ).distinctUntilChanged()

    private val current: ComposerAnswer
        get() = answer(
            picked = store?.current?.answer,
            terms = terminals?.state?.value,
            mac = session?.state?.value?.activeRecord?.isMac != false,
            ssh = projects?.state?.value?.project(target.project)?.isRemote == true
        )

    val kind: AnswerKind? get() = current.kind

    fun toggle(kind: AnswerKind) {
        val store = store ?: return
        store.setAnswer(if (store.current.answer == kind) null else kind)
    }

    fun turnOff() {
        store?.setAnswer(null)
    }

    /**
     * The composed prompt as it goes out: an ask for a video or an image while
     * the next prompt is one, the prompt itself otherwise.
     */
    fun outgoing(body: String): String =
        kind?.request(terminals?.state?.value.cli(target), body) ?: body

    private fun answer(
        picked: AnswerKind?,
        terms: TerminalsState?,
        mac: Boolean,
        ssh: Boolean
    ): ComposerAnswer {
        if (!target.terminalTools || terms.cli(target).isEmpty()) return ComposerAnswer()
        val offers = buildMap {
            if (terms.slashRows(target).any { it.name == VideoRequest.SKILL }) {
                put(AnswerKind.Video, AnswerOffer(R.string.video_needs_mac.takeUnless { mac }))
            }
            put(AnswerKind.Image, AnswerOffer(R.string.answer_not_in_ssh.takeIf { ssh }))
        }
        val offer = picked?.let { offers[it] }
        return ComposerAnswer(offers, picked.takeIf { offer != null && offer.offReason == null })
    }
}
