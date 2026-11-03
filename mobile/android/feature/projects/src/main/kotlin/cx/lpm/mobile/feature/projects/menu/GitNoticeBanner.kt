package cx.lpm.mobile.feature.projects.menu

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import cx.lpm.mobile.core.data.git.GitNotice
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR

/**
 * A finished Git op's short confirmation ("Pulled"), centered just under the bar
 * like the terminal banners, until the store lets it go. A discard the Mac kept a
 * copy of ends in Undo, which hands [onUndo] that copy's id.
 */
@Composable
fun GitNoticeBanner(
    notice: GitNotice?,
    modifier: Modifier = Modifier,
    onUndo: (id: String) -> Unit = {}
) {
    if (notice == null) return
    val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
    Popup(
        popupPositionProvider = remember(gap) { UnderBar(gap) },
        properties = PopupProperties(focusable = false)
    ) {
        AnimatedContent(
            targetState = notice,
            transitionSpec = {
                (slideInVertically { -it } + fadeIn()) togetherWith
                    (slideOutVertically { -it } + fadeOut())
            },
            label = "notice"
        ) { shown ->
            Row(
                modifier = modifier
                    .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                    .border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)
                    .padding(
                        start = 14.dp,
                        end = if (shown.undo == null) 14.dp else 5.dp,
                        top = if (shown.undo == null) 8.dp else 5.dp,
                        bottom = if (shown.undo == null) 8.dp else 5.dp
                    )
                    .semantics { liveRegion = LiveRegionMode.Polite },
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_check_circle_fill),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = shown.text,
                    style = LpmTheme.typography.footnote,
                    color = Color.White,
                    maxLines = 1
                )
                shown.undo?.let { id -> UndoButton { onUndo(id) } }
            }
        }
    }
}

/** The discard notice's Undo: a white capsule at the banner's end. */
@Composable
private fun UndoButton(onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    LinkButton(
        text = stringResource(ProjectsR.string.notice_undo),
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            onClick()
        },
        modifier = Modifier
            .background(Color.White, CircleShape)
            .padding(horizontal = 12.dp, vertical = 4.dp),
        color = Color.Black,
        textStyle = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold)
    )
}

/** Centered in the window, [gap] below the bar its anchor sits in. */
private class UnderBar(private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize
    ): IntOffset = IntOffset(
        (windowSize.width - popupContentSize.width) / 2,
        anchorBounds.bottom + gap
    )
}
