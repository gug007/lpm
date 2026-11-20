package cx.lpm.mobile.feature.terminal.composer

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R

/**
 * What the next prompt asks the agent to answer with, instead of text. Kept in step with
 * the desktop's `answerKind.ts` and iOS's `AnswerKind.swift`.
 */
enum class AnswerKind(
    /** The "+" menu row that turns it on. */
    @param:StringRes val menuLabel: Int,
    /** The chip the composer shows while it's on. */
    @param:StringRes val chip: Int,
    @param:StringRes val sendLabel: Int,
    @param:StringRes val placeholder: Int,
    @param:DrawableRes val icon: Int,
    /** Send's face while it's on. */
    @param:DrawableRes val sendIcon: Int = icon
) {
    Video(
        R.string.video_answer,
        R.string.answer_chip_video,
        R.string.video_send,
        R.string.video_placeholder,
        DesignR.drawable.ic_videocam,
        DesignR.drawable.ic_play_arrow_fill
    ),
    Image(
        R.string.answer_image,
        R.string.answer_chip_image,
        R.string.answer_image_send,
        R.string.answer_image_placeholder,
        DesignR.drawable.ic_image
    );

    /** The prompt as the agent receives it. */
    fun request(cli: String, prompt: String): String = when (this) {
        Video -> VideoRequest.build(cli, prompt)
        Image -> ImageRequest.build(prompt)
    }
}

/**
 * The desktop's `--accent-violet`, which marks a prompt that comes back as something
 * other than text.
 */
internal val answerAccent: Color
    @Composable @ReadOnlyComposable
    get() = if (LpmTheme.colors.isDark) Color(0xFFA78BFA) else Color(0xFF8B5CF6)

/** One answer other than text as a terminal's composer offers it. */
data class AnswerOffer(
    /** Why it can't be asked for here. */
    @param:StringRes val offReason: Int?
)
