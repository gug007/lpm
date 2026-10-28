package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

data class Project(
    val name: String,
    val label: String,
    val running: Boolean,
    val isRemote: Boolean,
    // The project this is a duplicate of; empty for originals. Drives whether the
    // phone offers "Remove" (only duplicates, whose folders are deleted on remove).
    val parentName: String,
    // A duplicate made as a linked git worktree rather than a folder copy.
    val worktree: Boolean,
    // The status a person set on this project, distinct from statusEntries
    // (what the agent is doing). Absent when none is set.
    val workStatus: WorkStatus?,
    // The project's own auto pull choice; null follows its parent or the Mac's
    // setting (see autoPullEnabled).
    val autoPull: Boolean?,
    // The project's own Claude account keys; neither set follows its parent or
    // the main accounts.
    val claude: ClaudeOwnChoice,
    val statusEntries: List<StatusEntry>,
    // Finished agents already opened, kept until archived. Empty from a Mac
    // without "agentArchive".
    val seenEntries: List<StatusEntry> = emptyList(),
    val services: List<Service>,
    val allServices: List<Service>,
    val profiles: List<Profile>,
    val activeProfile: String,
    val actions: List<Action>,
    /** Actions the Mac left out for a config problem, each naming its problem. */
    val actionErrors: List<String> = emptyList(),
    val zones: List<Zone>,
    /** Why the Mac couldn't read the project's YAML; the rest of the entry is then empty. */
    val configError: String?
) {
    val id: String get() = name
    val isDuplicate: Boolean get() = parentName.isNotEmpty()

    /** The desktop offers the Status menu on every local project. */
    val canHaveWorkStatus: Boolean get() = !isRemote

    /** Some agent reports here, a seen one included. */
    val hasAgentStatus: Boolean get() = statusEntries.isNotEmpty() || seenEntries.isNotEmpty()

    /**
     * A copy with fresh status — used by the status-changed push, which must not
     * erase the project's services/actions.
     */
    fun withStatus(entries: List<StatusEntry>, seen: List<StatusEntry>): Project =
        copy(statusEntries = entries, seenEntries = seen)

    /**
     * A copy wearing a status the phone has asked for but the Mac hasn't confirmed
     * yet; the projects push replaces it with what was written.
     */
    fun withWorkStatus(status: WorkStatus?): Project = copy(workStatus = status)

    fun withAutoPull(value: Boolean?): Project = copy(autoPull = value)

    fun withClaude(own: ClaudeOwnChoice): Project = copy(claude = own)

    companion object {
        fun parse(o: JsonObject): Project = Project(
            name = o.string("name").orEmpty(),
            label = o.label(fallback = "name"),
            running = o.bool("running") ?: false,
            isRemote = o.bool("isRemote") ?: false,
            parentName = o.string("parentName").orEmpty(),
            worktree = o.bool("worktree") ?: false,
            workStatus = o.obj("workStatus")?.let(WorkStatus::parse),
            autoPull = o.bool("autoPull"),
            claude = ClaudeOwnChoice.parse(o),
            statusEntries = o.list("statusEntries", StatusEntry::parse),
            seenEntries = o.list("seenEntries", StatusEntry::parse),
            services = o.list("services", Service::parse),
            allServices = o.list("allServices", Service::parse),
            profiles = o.list("profiles", Profile::parse),
            activeProfile = o.string("activeProfile").orEmpty(),
            actions = o.list("actions", Action::parse),
            actionErrors = o.strings("actionErrors").orEmpty(),
            zones = o.list("zones", Zone::parse),
            configError = o.string("configError")?.ifEmpty { null }
        )
    }
}

/** A started service whose command ended is [exited]; [exitCode] is null when the shell couldn't say. */
data class Service(
    val name: String,
    val port: Int,
    val exited: Boolean = false,
    val exitCode: Int? = null
) {
    val id: String get() = name

    companion object {
        fun parse(o: JsonObject): Service = Service(
            name = o.string("name").orEmpty(),
            port = o.int("port") ?: 0,
            exited = o.bool("exited") ?: false,
            exitCode = o.int("exitCode")
        )
    }
}

/**
 * A named bundle of services (mirrors the desktop ProfileInfo). Starting a profile
 * runs exactly its listed services.
 */
data class Profile(val name: String, val services: List<String>) {
    val id: String get() = name

    companion object {
        fun parse(o: JsonObject): Profile = Profile(
            name = o.string("name").orEmpty(),
            services = o.strings("services").orEmpty()
        )
    }
}

/** A sidebar folder (groups.json). `members` are project names contained in it. */
data class ProjectFolder(
    val id: String,
    val name: String,
    val collapsed: Boolean,
    val members: List<String>
) {
    companion object {
        fun parse(o: JsonObject): ProjectFolder = ProjectFolder(
            id = o.string("id").orEmpty(),
            name = o.string("name") ?: "Folder",
            collapsed = o.bool("collapsed") ?: false,
            members = o.strings("members").orEmpty()
        )
    }
}

/**
 * One service in the logs viewer. `paneIndex` is the index to pass to
 * `serviceLogs` when the project is running (null when stopped). One that [exited]
 * while the project runs keeps its pane, and so its logs.
 */
data class ServiceInfo(
    val name: String,
    val paneIndex: Int?,
    val running: Boolean,
    val cmd: String,
    val port: Int,
    val exited: Boolean = false,
    val exitCode: Int? = null
) {
    val id: String get() = name

    companion object {
        fun parse(o: JsonObject): ServiceInfo = ServiceInfo(
            name = o.string("name").orEmpty(),
            paneIndex = o.int("paneIndex"),
            running = o.bool("running") ?: false,
            cmd = o.string("cmd").orEmpty(),
            port = o.int("port") ?: 0,
            exited = o.bool("exited") ?: false,
            exitCode = o.int("exitCode")
        )
    }
}

/**
 * One level of the Mac folder browser (mirrors the Rust `DirListing`): the folder
 * listed, its parent (null at the filesystem root), and the immediate subfolders.
 */
data class DirListing(val path: String, val parent: String?, val dirs: List<String>) {
    companion object {
        fun parse(o: JsonObject): DirListing = DirListing(
            path = o.string("path").orEmpty(),
            parent = o.string("parent"),
            dirs = o.strings("dirs").orEmpty()
        )
    }
}

/**
 * One `~/.ssh/config` host (mirrors the Rust `SshConfigHost`). `port` is 0 and the
 * string fields empty when the host omits them.
 */
data class SshHostInfo(
    val name: String,
    val hostName: String,
    val user: String,
    val port: Int,
    val identityFile: String
) {
    val id: String get() = name

    companion object {
        fun parse(o: JsonObject): SshHostInfo = SshHostInfo(
            name = o.string("name").orEmpty(),
            hostName = o.string("hostName").orEmpty(),
            user = o.string("user").orEmpty(),
            port = o.int("port") ?: 0,
            identityFile = o.string("identityFile").orEmpty()
        )
    }
}
