package cx.lpm.mobile.feature.projects.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.PlainIconButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.feature.projects.R

/** A tip as a list row (iOS `TipCard`): its mark, what to try and a close button. */
@Composable
fun TipCard(tip: AppTip, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = ListDefaults.RowPadding, vertical = TipVerticalPadding),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(Modifier.width(28.dp), contentAlignment = Alignment.TopCenter) {
            Icon(
                painter = painterResource(tip.icon),
                contentDescription = null,
                tint = colors.tint,
                modifier = Modifier.size(22.dp)
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = stringResource(tip.title),
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label
            )
            Text(
                text = stringResource(tip.message),
                style = LpmTheme.typography.footnote,
                color = colors.secondaryLabel
            )
        }
        Spacer(Modifier.width(4.dp))
        PlainIconButton(
            icon = painterResource(DesignR.drawable.ic_close),
            contentDescription = stringResource(R.string.tip_close),
            onClick = onClose,
            tint = colors.tertiaryLabel,
            iconSize = 15.dp
        )
    }
}

@get:StringRes
private val AppTip.title: Int
    get() = when (this) {
        AppTip.ProjectMenu -> R.string.tip_project_menu_title
        AppTip.TabMenu -> R.string.tip_tab_menu_title
        AppTip.Actions -> R.string.tip_actions_title
        AppTip.Review -> R.string.tip_review_title
    }

@get:StringRes
private val AppTip.message: Int
    get() = when (this) {
        AppTip.ProjectMenu -> R.string.tip_project_menu_message
        AppTip.TabMenu -> R.string.tip_tab_menu_message
        AppTip.Actions -> R.string.tip_actions_message
        AppTip.Review -> R.string.tip_review_message
    }

@get:DrawableRes
private val AppTip.icon: Int
    get() = when (this) {
        AppTip.ProjectMenu, AppTip.TabMenu -> DesignR.drawable.ic_touch_app
        AppTip.Actions -> DesignR.drawable.ic_bolt
        AppTip.Review -> DesignR.drawable.ic_checklist
    }

/** SwiftUI's row padding plus the card's own 4 pt. */
private val TipVerticalPadding = 15.dp
