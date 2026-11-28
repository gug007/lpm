package cx.lpm.mobile.feature.projects.talk

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R

/** The button's height and the gap under it: what the list keeps clear at its foot. */
internal val TalkButtonInset = 64.dp

/**
 * The round button under the projects list that takes one spoken or typed request
 * (iOS `TalkButton`). [hidden] while its sheet is up.
 */
@Composable
internal fun TalkButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hidden: Boolean = false
) {
    Box(
        modifier
            .alpha(if (hidden) 0f else 1f)
            .size(56.dp)
            .dropShadow(
                shape = CircleShape,
                shadow = Shadow(
                    radius = 12.dp,
                    color = Color.Black.copy(alpha = 0.2f),
                    offset = DpOffset(0.dp, 6.dp)
                )
            )
            .background(LpmTheme.colors.tint, CircleShape)
            .clickableNoIndication(onClick = onClick, enabled = !hidden),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_graphic_eq),
            contentDescription = stringResource(R.string.talk_button),
            tint = Color.White,
            modifier = Modifier.size(28.dp)
        )
    }
}
