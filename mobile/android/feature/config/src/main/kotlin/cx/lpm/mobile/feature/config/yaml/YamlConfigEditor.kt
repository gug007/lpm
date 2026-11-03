package cx.lpm.mobile.feature.config.yaml

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.code.highlightCode
import cx.lpm.mobile.core.designsystem.code.rememberSyntaxColors
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.EditorTopBar
import cx.lpm.mobile.feature.config.R
import cx.lpm.mobile.feature.config.ui.BarBottomGap
import cx.lpm.mobile.feature.config.ui.CodeEditor

/**
 * The raw file editor: the layer picker, then the layer's text — or why it can't be
 * shown — under the Cancel / Save bar.
 */
@Composable
internal fun ColumnScope.YamlConfigEditor(
    state: YamlConfigUiState,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    onSelectLayer: (ConfigLayer) -> Unit,
    onEdit: (String) -> Unit,
    onRetry: () -> Unit
) {
    val haptics = LocalHapticFeedback.current
    val syntax = rememberSyntaxColors()
    val highlight = remember(syntax) { { text: String -> highlightCode(text, YAML, syntax) } }
    EditorTopBar(
        title = stringResource(R.string.config_edit_file),
        onCancel = onCancel,
        confirmLabel = stringResource(R.string.save),
        onConfirm = {
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            onSave()
        },
        confirmEnabled = state.canSave,
        busy = state.saving
    )
    SegmentedControl(
        options = ConfigLayer.entries.map { stringResource(it.title) },
        selectedIndex = state.layer.ordinal,
        onSelect = { onSelectLayer(ConfigLayer.entries[it]) },
        modifier = Modifier.padding(
            start = 16.dp,
            end = 16.dp,
            top = 16.dp + BarBottomGap,
            bottom = 16.dp
        )
    )
    HorizontalDivider(thickness = 0.5.dp, color = LpmTheme.colors.separator)
    Box(Modifier.weight(1f).fillMaxWidth()) {
        val error = state.loadError
        when {
            state.loading -> Loading()

            error != null -> InfoState(
                icon = DesignR.drawable.ic_warning,
                title = stringResource(R.string.config_yaml_load_failed),
                message = error,
                onRetry = onRetry
            )

            !state.available -> InfoState(
                icon = DesignR.drawable.ic_lock,
                title = stringResource(R.string.config_yaml_unavailable),
                message = stringResource(R.string.config_yaml_unavailable_message)
            )

            else -> Column(Modifier.fillMaxSize().imePadding()) {
                if (state.dirty) {
                    Text(
                        text = stringResource(R.string.config_yaml_unsaved),
                        style = LpmTheme.typography.caption1,
                        color = LpmTheme.colors.secondaryLabel,
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp)
                    )
                }
                CodeEditor(
                    text = state.text,
                    onTextChange = onEdit,
                    highlight = highlight,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

/** A failed save; the sheet stays open to try again. */
@Composable
fun YamlSaveErrorAlert(error: String?, onDismiss: () -> Unit) {
    if (error == null) return
    LpmAlert(
        title = stringResource(R.string.config_yaml_save_failed),
        message = error,
        buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
        onDismissRequest = onDismiss
    )
}

@Composable
private fun Loading(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ActivityIndicator()
        Text(
            text = stringResource(R.string.config_loading),
            style = LpmTheme.typography.body,
            color = LpmTheme.colors.secondaryLabel,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}

@Composable
private fun InfoState(
    icon: Int,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null
) {
    Column(
        modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = null,
            tint = LpmTheme.colors.secondaryLabel,
            modifier = Modifier.size(39.dp)
        )
        Text(title, style = LpmTheme.typography.headline)
        Text(
            text = message,
            style = LpmTheme.typography.subheadline,
            color = LpmTheme.colors.secondaryLabel,
            textAlign = TextAlign.Center
        )
        if (onRetry != null) {
            CapsuleButton(
                text = stringResource(R.string.config_try_again),
                onClick = onRetry,
                textStyle = LpmTheme.typography.body
            )
        }
    }
}

/** The extension iOS's editor colors a configuration file as. */
private const val YAML = "yml"
