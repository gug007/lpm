package cx.lpm.mobile.feature.files.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.files.R
import kotlinx.coroutines.delay

private const val COPIED_MS = 1_500L

/**
 * The steps after reading a file: mention it in the prompt of the tab it was opened
 * from, see its diff when it has changes, copy its path. Each is left out where it
 * can't apply (null).
 */
@Composable
internal fun FilePreviewActionBar(
    onMention: (() -> Unit)?,
    onDiff: (() -> Unit)?,
    onCopyPath: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptics = LocalHapticFeedback.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPIED_MS)
            copied = false
        }
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(LpmTheme.colors.barMaterial)
            .padding(start = 8.dp, end = 8.dp, top = 6.dp)
    ) {
        if (onMention != null) {
            Item(
                stringResource(R.string.files_mention),
                DesignR.drawable.ic_alternate_email,
                onMention
            )
        }
        if (onDiff != null) {
            Item(stringResource(R.string.files_diff), DesignR.drawable.ic_exposure, onDiff)
        }
        Item(
            title = stringResource(if (copied) R.string.files_copied else R.string.files_copy_path),
            icon = if (copied) DesignR.drawable.ic_check else DesignR.drawable.ic_content_copy
        ) {
            onCopyPath()
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            copied = true
        }
    }
}

@Composable
private fun RowScope.Item(title: String, icon: Int, onClick: () -> Unit) {
    val tint = LpmTheme.colors.tint
    Column(
        modifier = Modifier
            .weight(1f)
            .defaultMinSize(minHeight = 48.dp)
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)
    ) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(22.dp)
        )
        Text(
            text = title,
            style = LpmTheme.typography.caption2,
            color = tint,
            maxLines = 1
        )
    }
}
