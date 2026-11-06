package cx.lpm.mobile.core.demo

/**
 * Demo handlers for config editing (raw-YAML read/write per layer and structured
 * service/profile/action edits) plus the harmless push acks (`apnsToken`,
 * `liveActivity`, `answerAgent`), which nothing in Demo Mode sends. Reads reply inline;
 * every write replies after a short simulated worker-thread delay and emits
 * `projects-changed`, mirroring the desktop.
 */
internal fun DemoServer.registerConfigHandlers() {
    registerRawYamlHandlers()
    registerServiceConfigHandlers()
    registerProfileHandlers()
    registerActionConfigHandlers()
    register("apnsToken") { push(mapOf("t" to "apnsToken", "ok" to true)) }
    register("liveActivity") { push(mapOf("t" to "liveActivity", "ok" to true)) }
    register("answerAgent") { o ->
        if (o.string("action") == "pick") {
            answerDemoDialog(o)
            return@register
        }
        val reply = mutableMapOf<String, Any?>("t" to "answerAgent", "ok" to true)
        o["reqId"]?.let { reply["reqId"] = it }
        push(reply)
    }
}

// raw YAML

private fun DemoServer.registerRawYamlHandlers() {
    register("readConfig") { o ->
        val project = o.string("project") ?: return@register
        val layer = o.string("layer") ?: return@register
        val p = world.project(project)
        if (p == null) {
            push(
                mapOf(
                    "t" to "readConfig",
                    "ok" to false,
                    "project" to project,
                    "layer" to layer,
                    "error" to "Couldn't find the project."
                )
            )
            return@register
        }
        if (layer == "repo" && p.isRemote) {
            push(
                mapOf(
                    "t" to "readConfig",
                    "ok" to true,
                    "project" to project,
                    "layer" to layer,
                    "content" to "",
                    "available" to false
                )
            )
            return@register
        }
        val content = world.configText[configKey(project, layer)] ?: defaultConfigText(p, layer)
        push(
            mapOf(
                "t" to "readConfig",
                "ok" to true,
                "project" to project,
                "layer" to layer,
                "content" to content,
                "available" to true
            )
        )
    }

    register("saveConfig") { o ->
        val project = o.string("project") ?: return@register
        val layer = o.string("layer") ?: return@register
        val reply = mapOf(
            "t" to "saveConfig",
            "project" to project,
            "layer" to layer,
            "name" to project
        )
        if (world.projectIndex(project) == null) {
            pushAfter(0.3, reply + mapOf("ok" to false, "error" to "Couldn't find the project."))
            return@register
        }
        world.configText[configKey(project, layer)] = o.string("content") ?: ""
        pushAfter(0.3, reply + ("ok" to true))
        pushAfter(0.4, mapOf("t" to "projects-changed"))
    }
}

/** A config write's reply after the simulated delay, and the `projects-changed` after it. */
private fun DemoServer.writeReply(t: String, project: String, keyName: String, key: String) {
    pushAfter(0.3, mapOf("t" to t, "ok" to true, "project" to project, keyName to key))
    pushAfter(0.4, mapOf("t" to "projects-changed"))
}

private fun DemoServer.writeFailure(t: String, project: String, keyName: String, key: String) {
    pushAfter(
        0.3,
        mapOf(
            "t" to t,
            "ok" to false,
            "project" to project,
            keyName to key,
            "error" to "Couldn't find the project."
        )
    )
}

// services

private fun DemoServer.registerServiceConfigHandlers() {
    register("serviceBody") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val s = world.project(project)?.services?.firstOrNull { it.name == key }
        if (s == null) {
            push(
                mapOf(
                    "t" to "serviceBody",
                    "ok" to false,
                    "project" to project,
                    "key" to key,
                    "error" to "Couldn't read the service."
                )
            )
            return@register
        }
        val body = mutableMapOf<String, Any?>("cmd" to s.cmd)
        if (s.port > 0) body["port"] = s.port
        body.putAll(serviceExtras(project, key))
        push(
            mapOf(
                "t" to "serviceBody",
                "ok" to true,
                "project" to project,
                "key" to key,
                "body" to body,
                "source" to "project"
            )
        )
    }

    register("saveService") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("saveService", project, "key", key)
            return@register
        }
        val previousKey = o.string("previousKey")
        if (!previousKey.isNullOrEmpty() && previousKey != key) {
            renameServiceReferences(p, from = previousKey, to = key)
        }
        val payload = o.dict("payload") ?: emptyMap()
        val extras = payload - "cmd" - "port"
        val cmd = payload.string("cmd") ?: ""
        val port = payload.int("port") ?: 0
        val existing = p.services.firstOrNull { it.name == key }
        if (existing != null) {
            existing.cmd = cmd
            existing.port = port
        } else {
            p.services += DemoWorld.Svc(name = key, cmd = cmd, port = port, running = false)
        }
        if (extras.isEmpty()) {
            world.serviceExtras.remove("$project\n$key")
        } else {
            world.serviceExtras["$project\n$key"] = extras
        }
        reflowProjectLayer(project)
        writeReply("saveService", project, "key", key)
    }

    register("deleteService") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("deleteService", project, "key", key)
            return@register
        }
        p.services = p.services.filter { it.name != key }
        world.serviceExtras.remove("$project\n$key")
        for (profile in p.profiles) profile.services = profile.services.filter { it != key }
        rewriteDependsOn(project) { if (it == key) null else it }
        reflowProjectLayer(project)
        writeReply("deleteService", project, "key", key)
    }
}

// profiles

private fun DemoServer.registerProfileHandlers() {
    register("saveProfile") { o ->
        val project = o.string("project") ?: return@register
        val name = o.string("name") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("saveProfile", project, "name", name)
            return@register
        }
        val services = o.strings("services") ?: emptyList()
        val previous = o.string("previousName")?.takeIf { it.isNotEmpty() }
        val renamed = p.profiles.firstOrNull { it.name == previous }
        if (previous != null && previous != name && renamed != null) {
            renamed.name = name
            if (p.activeProfile == previous) p.activeProfile = name
        }
        val existing = p.profiles.firstOrNull { it.name == name }
        if (existing != null) {
            existing.services = services
        } else {
            p.profiles += DemoWorld.Profile(name = name, services = services)
        }
        reflowProjectLayer(project)
        writeReply("saveProfile", project, "name", name)
    }

    register("deleteProfile") { o ->
        val project = o.string("project") ?: return@register
        val name = o.string("name") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("deleteProfile", project, "name", name)
            return@register
        }
        p.profiles = p.profiles.filter { it.name != name }
        if (p.activeProfile == name) p.activeProfile = ""
        reflowProjectLayer(project)
        writeReply("deleteProfile", project, "name", name)
    }
}

// actions

private fun DemoServer.registerActionConfigHandlers() {
    register("actionBody") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val body = storedActionBody(project, key)
        if (body == null) {
            push(
                mapOf(
                    "t" to "actionBody",
                    "ok" to false,
                    "project" to project,
                    "key" to key,
                    "error" to "Couldn't read the action."
                )
            )
            return@register
        }
        push(
            mapOf(
                "t" to "actionBody",
                "ok" to true,
                "project" to project,
                "key" to key,
                "body" to body,
                "section" to "actions",
                "source" to "project"
            )
        )
    }

    register("saveAction") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("saveAction", project, "key", key)
            return@register
        }
        val previousKey = o.string("previousKey")?.takeIf { it.isNotEmpty() }
        val existing = p.actions.indexOfFirst { it.string("name") == (previousKey ?: key) }
            .takeIf { it >= 0 }
        if (existing == null && ":" in key) {
            pushAfter(
                0.3,
                mapOf(
                    "t" to "saveAction",
                    "ok" to false,
                    "project" to project,
                    "key" to key,
                    "error" to "Action names can't contain a colon."
                )
            )
            return@register
        }
        val entry = (o.dict("payload") ?: emptyMap()).toMutableMap()
        entry["name"] = key
        entry.remove("children")
        entry.dict("inputs")?.let { inputs ->
            if (inputs.isEmpty()) entry.remove("inputs") else entry["inputs"] = wireInputs(inputs)
        }
        entry.dict("actions")?.let { entry["children"] = actionInfoChildren(key, it) }
        // An unchanged template keeps the label the Mac would render from it.
        if (existing != null) {
            val template = p.actions[existing].string("configLabel")
            if (template != null && entry.string("label") == template) {
                entry["configLabel"] = template
                val rendered = p.actions[existing]["label"]
                if (rendered != null) entry["label"] = rendered else entry.remove("label")
            }
        }
        // An unchanged popup keeps the card the Mac makes from it.
        if (existing != null) {
            val config = p.actions[existing].dict("configPopup")?.asStringMap()
            if (config != null && entry.dict("popup")?.asStringMap() == config) {
                entry["configPopup"] = config
                entry["popup"] = p.actions[existing]["popup"]
            }
        }
        p.actions = if (existing != null) {
            p.actions.toMutableList().also { it[existing] = entry }
        } else {
            p.actions + entry
        }
        reflowProjectLayer(project)
        writeReply("saveAction", project, "key", key)
    }

    register("deleteAction") { o ->
        val project = o.string("project") ?: return@register
        val key = o.string("key") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] }
        if (p == null) {
            writeFailure("deleteAction", project, "key", key)
            return@register
        }
        p.actions = p.actions.filter { it.string("name") != key }
        reflowProjectLayer(project)
        writeReply("deleteAction", project, "key", key)
    }
}
