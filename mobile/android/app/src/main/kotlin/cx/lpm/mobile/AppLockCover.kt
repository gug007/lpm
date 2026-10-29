package cx.lpm.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.PrimaryButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** What covers the app while it's locked (iOS `AppLockCover`); it takes every touch. */
@Composable
internal fun AppLockCover(onUnlock: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Box(
        modifier
            .fillMaxSize()
            .background(colors.systemBackground)
            .clickable(
                interactionSource = remember {
                    MutableInteractionSource()
                },
                indication = null
            ) {},
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Icon(
                painterResource(DesignR.drawable.ic_lock),
                contentDescription = null,
                tint = colors.tint,
                modifier = Modifier.size(52.dp)
            )
            Text(stringResource(R.string.lock_title), style = LpmTheme.typography.headline)
            Text(
                stringResource(R.string.lock_message),
                style = LpmTheme.typography.subheadline,
                color = colors.secondaryLabel,
                textAlign = TextAlign.Center
            )
            PrimaryButton(text = stringResource(R.string.lock_unlock), onClick = onUnlock)
        }
    }
}
