package cx.lpm.mobile.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.tips.TipsStore
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Settings › Tips: whether any tip was closed, and showing them all again. */
@HiltViewModel
class TipsViewModel @Inject constructor(private val tips: TipsStore) : ViewModel() {
    val anyClosed: StateFlow<Boolean> = tips.closed
        .map { it.isNotEmpty() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun showAgain() = tips.reset()
}

@Composable
fun TipsSection(viewModel: TipsViewModel = hiltViewModel()) {
    val anyClosed by viewModel.anyClosed.collectAsStateWithLifecycle()
    ListSection(
        header = stringResource(R.string.settings_tips),
        headerStyle = ListHeaderStyle.Title,
        footer = stringResource(R.string.settings_tips_footer)
    ) {
        ButtonRow(
            text = stringResource(R.string.settings_tips_show_again),
            onClick = viewModel::showAgain,
            enabled = anyClosed
        )
    }
}
