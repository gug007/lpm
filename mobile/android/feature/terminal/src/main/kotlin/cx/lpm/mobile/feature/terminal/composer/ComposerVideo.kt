package cx.lpm.mobile.feature.terminal.composer

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/** The desktop's `--accent-violet`, which marks a prompt that comes back as a video. */
internal val videoAccent: Color
    @Composable @ReadOnlyComposable
    get() = if (LpmTheme.colors.isDark) Color(0xFFA78BFA) else Color(0xFF8B5CF6)

/** A video answer as a terminal's composer offers it, where its agent can make one. */
data class ComposerVideo(
    /** The next prompt asks the agent for a video of its answer. */
    val on: Boolean,
    /** Why the computer the terminal runs on can't make a video. */
    @param:StringRes val offReason: Int?
)

/**
 * Video answers in one terminal's composer: whether its agent can make one (its
 * command list holds the skill) and whether the next prompt asks for one.
 */
internal class ComposerVideoAnswers(
    private val target: ComposerTarget,
    private val session: MacSession?,
    private val store: ComposerStore?
) {
    private val terminals = session?.store<TerminalsStore>()

    /** Null where there is no video to offer. */
    val state: Flow<ComposerVideo?> = combine(
        store?.state?.map { it.videoOn }?.distinctUntilChanged() ?: flowOf(false),
        terminals?.state ?: flowOf(null),
        session?.state?.map { it.activeRecord?.isMac != false }?.distinctUntilChanged()
            ?: flowOf(true),
        ::video
    ).distinctUntilChanged()

    private val current: ComposerVideo?
        get() = video(
            picked = store?.current?.videoOn == true,
            terms = terminals?.state?.value,
            mac = session?.state?.value?.activeRecord?.isMac != false
        )

    val on: Boolean get() = current?.on == true

    fun toggle() {
        val store = store ?: return
        store.setVideoOn(!store.current.videoOn)
    }

    fun turnOff() {
        store?.setVideoOn(false)
    }

    /**
     * The composed prompt as it goes out: a call to the video skill while the next
     * prompt asks for a video, the prompt itself otherwise.
     */
    fun outgoing(body: String): String =
        if (on) VideoRequest.build(terminals?.state?.value.cli(target), body) else body

    private fun video(picked: Boolean, terms: TerminalsState?, mac: Boolean): ComposerVideo? {
        if (!target.terminalTools || terms.cli(target).isEmpty()) return null
        if (terms.slashRows(target).none { it.name == VideoRequest.SKILL }) return null
        val offReason = R.string.video_needs_mac.takeUnless { mac }
        return ComposerVideo(on = picked && offReason == null, offReason = offReason)
    }
}
