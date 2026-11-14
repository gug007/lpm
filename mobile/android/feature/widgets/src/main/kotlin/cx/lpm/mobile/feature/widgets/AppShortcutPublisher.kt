package cx.lpm.mobile.feature.widgets

import android.content.Context
import android.content.Intent
import androidx.annotation.DrawableRes
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.projects.ProjectOpens
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.push.PushNotifier
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Writes the app icon's long-press menu as the app leaves the screen (iOS
 * `AppShortcutPublisher`), from the same live tab list the Agents widget shows. Demo
 * Mode's projects aren't real, so it leaves the menu empty.
 */
@Singleton
class AppShortcutPublisher @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val session: MacSession,
    private val opens: ProjectOpens,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    fun start() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) = publish()
            }
        )
    }

    private fun publish() {
        val state = session.state.value
        if (state.demoMode) {
            scope.launch(Dispatchers.IO) {
                ShortcutManagerCompat.removeAllDynamicShortcuts(context)
            }
            return
        }
        val projects = session.store<ProjectsStore>().state.value
        val mac = liveMac(
            state,
            session.link.state.value,
            projects,
            session.store<TerminalsStore>().state.value
        ) ?: return
        val labels = HashMap<String, String>()
        projects.projects.forEach { labels.putIfAbsent(it.name, it.label) }
        val newTabIn = opens.lastOpened
            ?.takeIf { session.store<AgentLaunchStore>().canLaunchAgents }
            ?.let { name -> projects.projects.firstOrNull { it.name == name } }
        val shortcuts = appShortcuts(mac.rows, state.activeRecord?.serverId, newTabIn) { name ->
            labels[name]?.takeIf { it.isNotEmpty() } ?: name
        }.mapIndexed { rank, shortcut -> shortcut.info(context, rank) }
        scope.launch(Dispatchers.IO) {
            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
        }
    }
}

/**
 * Android shows one line per shortcut: the long label when it fits, else the short one.
 * So the long label leads with the title, followed by iOS's subtitle.
 */
internal fun AppShortcut.info(context: Context, rank: Int): ShortcutInfoCompat {
    val (short, long) = when (this) {
        is AppShortcut.Tab -> title to "$title · $subtitle"

        is AppShortcut.NewTab -> {
            val newTab = context.getString(R.string.app_shortcut_new_tab)
            newTab to "$newTab ${context.getString(R.string.app_shortcut_new_tab_in, projectLabel)}"
        }
    }
    return ShortcutInfoCompat.Builder(context, id)
        .setShortLabel(short)
        .setLongLabel(long)
        .setIcon(IconCompat.createWithResource(context, icon))
        .setIntent(openIntent(context))
        .setRank(rank)
        .build()
}

private val AppShortcut.icon: Int
    @DrawableRes get() = when (this) {
        is AppShortcut.NewTab -> R.drawable.app_shortcut_new_tab

        is AppShortcut.Tab -> when (state) {
            AgentState.NeedsYou -> R.drawable.app_shortcut_needs_you
            AgentState.Error -> R.drawable.app_shortcut_error
            AgentState.Done -> R.drawable.app_shortcut_done
            AgentState.Working, AgentState.Idle -> R.drawable.app_shortcut_working
        }
    }

/** Opens the way a notification tap or an Agents widget row does, on the shortcut's Mac. */
private fun AppShortcut.openIntent(context: Context): Intent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    intent.action = PushNotifier.ACTION_OPEN
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    serverId?.let { intent.putExtra(NotificationOpenTarget.SERVER_ID, it) }
    intent.putExtra(NotificationOpenTarget.PROJECT, project)
    when (this) {
        is AppShortcut.Tab -> {
            intent.putExtra(NotificationOpenTarget.TARGET, "terminal")
            intent.putExtra(NotificationOpenTarget.TERMINAL_ID, terminalId)
        }

        is AppShortcut.NewTab ->
            intent.putExtra(NotificationOpenTarget.TARGET, NotificationOpenTarget.NEW_TAB)
    }
    return intent
}
