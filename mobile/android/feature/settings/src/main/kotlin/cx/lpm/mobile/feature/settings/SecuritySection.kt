package cx.lpm.mobile.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.lock.AppLock
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Settings › Security: the app's own lock (iOS `SecuritySection`). */
@HiltViewModel
class SecurityViewModel @Inject constructor(private val lock: AppLock) : ViewModel() {
    val state: StateFlow<AppLock.State> = lock.state

    fun setEnabled(on: Boolean) {
        viewModelScope.launch { lock.setEnabled(on) }
    }

    fun setAfter(seconds: Int) = lock.setAfter(seconds)

    fun setConfirmRisky(on: Boolean) = lock.setConfirmRisky(on)
}

@Composable
fun SecuritySection(viewModel: SecurityViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val labels = AppLock.AFTER_CHOICES.associateWith { afterLabel(it) }
    ListSection(
        header = stringResource(R.string.settings_security),
        headerStyle = ListHeaderStyle.Title,
        footer = stringResource(
            if (state.available) {
                R.string.settings_security_footer
            } else {
                R.string.settings_security_no_lock
            }
        )
    ) {
        ToggleRow(
            title = stringResource(R.string.settings_require_lock),
            checked = state.enabled,
            onCheckedChange = viewModel::setEnabled,
            enabled = state.available
        )
        if (state.enabled) {
            PickerRow(
                title = stringResource(R.string.settings_lock_after),
                options = AppLock.AFTER_CHOICES,
                selected = state.after,
                onSelect = viewModel::setAfter,
                optionLabel = { labels.getValue(it) }
            )
        }
        ToggleRow(
            title = stringResource(R.string.settings_confirm_risky),
            checked = state.confirmRisky,
            onCheckedChange = viewModel::setConfirmRisky,
            enabled = state.available
        )
    }
}

@Composable
private fun afterLabel(seconds: Int): String = when (seconds) {
    0 -> stringResource(R.string.settings_lock_immediately)
    else -> pluralStringResource(R.plurals.settings_lock_minutes, seconds / 60, seconds / 60)
}
