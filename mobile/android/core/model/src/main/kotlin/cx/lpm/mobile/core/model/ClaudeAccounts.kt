package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The main login's account id, as the Mac names it in lists and usage readings. */
const val CLAUDE_MAIN_LOGIN = "default"

/**
 * One Claude login the Mac knows: the main login first, then each account added in
 * the Mac's Settings › Accounts & usage › Claude.
 */
data class ClaudeAccountInfo(
    val id: String,
    val label: String,
    /** The name given on the Mac, which usage cards and rows are titled by. */
    val name: String?,
    val signedIn: Boolean,
    val email: String,
    /** "max", "pro", "team", "enterprise", or "" when unknown. */
    val plan: String,
    /** Confirmed on the Mac as this person's alone, needed before it takes turns in a list. */
    val confirmed: Boolean
) {
    /** Personal plans take turns without the Mac allowing them first. */
    val personal: Boolean get() = plan == "max" || plan == "pro"

    companion object {
        fun parse(o: JsonObject): ClaudeAccountInfo {
            val id = o.string("id").orEmpty()
            val email = o.string("email").orEmpty()
            val named = o.string("label")?.ifEmpty { null }
            return ClaudeAccountInfo(
                id = id,
                label = when {
                    id == CLAUDE_MAIN_LOGIN -> "Main login"
                    else -> named ?: email.ifEmpty { "Removed account" }
                },
                name = named,
                signedIn = o.bool("signedIn") ?: false,
                email = email,
                plan = o.string("plan").orEmpty(),
                confirmed = o.bool("confirmed") ?: false
            )
        }
    }
}

/** Where account switching stands on the Mac. */
data class ClaudeSwitching(
    val enabled: Boolean,
    /** Switching actually runs: on, confirmed, and possible on that Mac. */
    val active: Boolean,
    /** "hold" or "readings" while switching is paused. */
    val paused: String?,
    /** Team and work seats the person allowed to take turns. */
    val allowed: List<String>,
    val maxMembers: Int,
    /** Each pool's account for new sessions, keyed by its project, or "" for the main accounts. */
    val current: Map<String, String>,
    /** Each pool's accounts in order, keyed like `current`; empty from older Macs. */
    val members: Map<String, List<String>>
) {
    companion object {
        fun parse(o: JsonObject): ClaudeSwitching {
            val current = mutableMapOf<String, String>()
            val members = mutableMapOf<String, List<String>>()
            for (pool in o.objects("pools").orEmpty()) {
                val key = pool.string("project").orEmpty()
                pool.string("current")?.let { current[key] = it }
                pool.strings("members")?.let { members[key] = it }
            }
            return ClaudeSwitching(
                enabled = o.bool("enabled") ?: false,
                active = o.bool("active") ?: false,
                paused = o.string("paused"),
                allowed = o.strings("allowed").orEmpty(),
                maxMembers = o.int("maxMembers") ?: 3,
                current = current,
                members = members
            )
        }
    }
}

/** The `claudeAccounts` reply: every account and where switching stands. */
data class ClaudeAccounts(val accounts: List<ClaudeAccountInfo>, val switching: ClaudeSwitching) {
    /** The menu appears once an account beyond the main login is added, as on the desktop. */
    val hasAdded: Boolean get() = accounts.any { it.id != CLAUDE_MAIN_LOGIN }

    fun account(id: String): ClaudeAccountInfo? = accounts.firstOrNull { it.id == id }

    /** An id's name; "" is the main login, as a pin writes it. */
    fun label(id: String): String {
        if (id.isEmpty() || id == CLAUDE_MAIN_LOGIN) return "Main login"
        return account(id)?.label ?: "Removed account"
    }

    /** Which login the main accounts give new sessions right now. */
    val mainNow: String
        get() {
            if (!switching.active) return "Main login"
            val name = label(switching.current[""] ?: CLAUDE_MAIN_LOGIN)
            return if (switching.paused == null) name else "Paused · $name"
        }

    /** Why an account can't join a list from the phone, or null when it can. */
    fun blocked(account: ClaudeAccountInfo): String? {
        if (!account.signedIn) return "Sign in on your Mac first"
        if (!account.personal && account.id !in switching.allowed) {
            return "Allow it in lpm on your Mac first"
        }
        return null
    }

    /** What a project's own keys choose, in words. */
    fun describe(own: ClaudeOwnChoice): String {
        own.account?.let { return label(it) }
        if (own.list.isNotEmpty()) return own.list.joinToString(", ") { label(it) }
        return "Main accounts"
    }

    companion object {
        fun parse(o: JsonObject): ClaudeAccounts = ClaudeAccounts(
            accounts = o.list("accounts", ClaudeAccountInfo::parse),
            switching = ClaudeSwitching.parse(o.obj("switching") ?: JsonObject(emptyMap()))
        )
    }
}

/**
 * A project's own `claudeAccount` and `claudeAccounts` keys, as its YAML holds
 * them. Neither set means the main accounts, or for a copy its parent's choice.
 */
data class ClaudeOwnChoice(
    /** One account always; "" is the main login. */
    val account: String? = null,
    /** An ordered list to take turns on; empty on a copy means the main accounts. */
    val accounts: List<String>? = null
) {
    val followsParent: Boolean get() = account == null && accounts == null

    /** The project's own list, which a pin outranks. */
    val list: List<String> get() = if (account == null) accounts.orEmpty() else emptyList()

    fun usesMainAccounts(isCopy: Boolean): Boolean {
        if (account != null) return false
        val accounts = accounts ?: return !isCopy
        return accounts.isEmpty()
    }

    companion object {
        fun parse(o: JsonObject): ClaudeOwnChoice = ClaudeOwnChoice(
            account = o.string("claudeAccount"),
            accounts = o.strings("claudeAccounts")
        )
    }
}

/** What the menu sets, matching the desktop's `set_claude_account_choice`. */
sealed interface ClaudeAccountChoice {
    data object Parent : ClaudeAccountChoice

    data object Main : ClaudeAccountChoice

    /** "" is the main login. */
    data class Pin(val id: String) : ClaudeAccountChoice

    /** Swift's `.list`: an ordered list to take turns on. */
    data class AccountList(val ids: List<String>) : ClaudeAccountChoice

    val wire: JsonObject
        get() = when (this) {
            Parent -> buildJsonObject { put("kind", "parent") }

            Main -> buildJsonObject { put("kind", "main") }

            is Pin -> buildJsonObject {
                put("kind", "pin")
                put("id", id)
            }

            is AccountList -> buildJsonObject {
                put("kind", "list")
                put("ids", JsonArray(ids.map { JsonPrimitive(it) }))
            }
        }

    /**
     * The keys the Mac writes for this choice, so the menu shows it before the
     * projects push brings back what was written.
     */
    fun own(isCopy: Boolean): ClaudeOwnChoice = when (this) {
        Parent -> ClaudeOwnChoice()
        Main -> ClaudeOwnChoice(accounts = if (isCopy) emptyList() else null)
        is Pin -> ClaudeOwnChoice(account = id)
        is AccountList -> ClaudeOwnChoice(accounts = ids)
    }

    companion object {
        fun fromWire(o: JsonObject): ClaudeAccountChoice? = when (o.string("kind")) {
            "parent" -> Parent
            "main" -> Main
            "pin" -> Pin(o.string("id").orEmpty())
            "list" -> AccountList(o.strings("ids").orEmpty())
            else -> null
        }
    }
}
