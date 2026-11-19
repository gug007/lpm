package cx.lpm.mobile

import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.android.play.core.review.ReviewManagerFactory
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.review.ReviewAsk
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Puts Play's rating prompt up a moment after a win makes one due (iOS
 * `ReviewAskPresenter`); Play decides whether it shows.
 */
@Composable
internal fun ReviewAskPresenter(prefs: AppPreferences, version: String) {
    val activity = LocalActivity.current
    val dueFlow = remember(prefs, version) {
        prefs.data.map { ReviewAsk.due(prefs, version) }.distinctUntilChanged()
    }
    val due by dueFlow.collectAsStateWithLifecycle(false)
    LaunchedEffect(due) {
        if (!due) return@LaunchedEffect
        delay(ASK_DELAY_MS)
        if (activity == null) return@LaunchedEffect
        val manager = ReviewManagerFactory.create(activity)
        manager.requestReviewFlow().addOnCompleteListener { request ->
            if (request.isSuccessful) manager.launchReviewFlow(activity, request.result)
        }
        ReviewAsk.asked(prefs, version)
    }
}

private const val ASK_DELAY_MS = 2_000L
