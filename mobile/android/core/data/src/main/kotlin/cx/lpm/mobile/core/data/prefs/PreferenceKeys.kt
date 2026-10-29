package cx.lpm.mobile.core.data.prefs

/** The iOS UserDefaults key names, kept identical (PORTING.md "Persisted state"). */
object PreferenceKeys {
    const val MACS = "lpm.macs"
    const val ACTIVE_MAC_ID = "lpm.activeMacId"
    const val MACHINE_IMPORTS = "lpm.machineImports"
    const val MACHINE_IMPORTS_REVOKED = "lpm.machineImportsRevoked"

    const val NOTIFY_ENABLED = "lpm.notify.enabled"
    const val NOTIFY_WAITING = "lpm.notify.waiting"
    const val NOTIFY_DONE = "lpm.notify.done"
    const val NOTIFY_ERROR = "lpm.notify.error"
    const val NOTIFY_AUTOMATION_STARTED = "lpm.notify.automation.started"
    const val NOTIFY_AUTOMATION_DONE = "lpm.notify.automation.done"
    const val NOTIFY_AUTOMATION_ERROR = "lpm.notify.automation.error"
    const val NOTIFY_WEEKLY_RECAP = "lpm.notify.weeklyRecap"
    const val NOTIFY_LIVE_ACTIVITY = "lpm.notify.liveActivity"
    const val NOTIFY_PROJECTS = "lpm.notify.projects"
    const val NOTIFY_QUIET_ENABLED = "lpm.notify.quiet.enabled"
    const val NOTIFY_QUIET_START = "lpm.notify.quiet.start"
    const val NOTIFY_QUIET_END = "lpm.notify.quiet.end"
    const val NOTIFY_QUIET_WAITING = "lpm.notify.quiet.waiting"

    const val LOCK_ENABLED = "lpm.lock.enabled"
    const val LOCK_AFTER = "lpm.lock.after"
    const val LOCK_CONFIRM_RISKY = "lpm.lock.confirmRisky"

    /** Android only: the Macs whose agents-at-work card was swiped away until they're done. */
    const val LIVE_DISMISSED = "liveActivity.dismissed"

    const val APPEARANCE_MODE = "appearanceMode"
    const val TERMINAL_FONT_SIZE = "terminalFontSize"
    const val TERMINAL_THEME = "terminalTheme"

    const val SPEECH_ENGINE = "speech.engine"
    const val SPEECH_VOICE_ID = "speech.voiceId"
    const val SPEECH_RATE = "speech.rate"

    const val BUILT_IN_TAILSCALE_ENABLED = "builtInTailscale.enabled"
    const val USES_TAILSCALE_APP = "pairing.usesTailscaleApp"

    const val ACTIVITY_GROUP_BY_PROJECT = "activity.groupByProject"
    const val AUTOMATION_SCHEDULE_OPEN = "automation.scheduleOpen"
    const val AUTOMATION_SETUP_OPEN = "automation.setupOpen"
    const val FILE_PREVIEW_MARKDOWN_SOURCE = "filePreviewMarkdownSource"
    const val ACTION_PRIMARY_LAST_USED = "actionPrimaryLastUsed"
    const val ZONE_OPEN_LAYERS = "zoneOpenLayers"
    const val NEW_TAB_LAST_PICK = "newTab.lastPick"
    const val NEW_TAB_LAST_OPTION = "newTab.lastOption"
    const val GIT_REVIEW_WRAP = "gitReview.wrap"

    const val TOKEN_ACTIVITY_RANGE = "tokenActivity.range"

    /** The last push registration a Mac acknowledged. */
    fun pushRegistered(localId: String): String = "lpm.push.registered.$localId"

    fun macUpdateDismissed(id: String): String = "macUpdate.dismissed.$id"
}
