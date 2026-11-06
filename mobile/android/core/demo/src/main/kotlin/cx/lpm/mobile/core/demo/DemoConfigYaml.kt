package cx.lpm.mobile.core.demo

// Config storage helpers and the YAML a project's layer reads back as.

private val serviceKeyOrder = listOf("cmd", "cwd", "port", "portConflict", "env", "dependsOn")
private val actionKeyOrder = listOf(
    "label", "emoji", "cmd", "cwd", "type", "reuse",
    "confirm", "display", "layer", "inputs", "actions"
)
private val zoneKeyOrder = listOf("rows", "label", "display", "position", "collapsed", "layers")
private val inputKeyOrder = listOf(
    "key",
    "label",
    "type",
    "required",
    "placeholder",
    "default",
    "persist",
    "options",
    "value",
    "position"
)

/**
 * A duplicate reads and writes its parent's project file, and the global layer is one
 * file shared by every project: normalize both into the storage key.
 */
internal fun DemoServer.configKey(project: String, layer: String): String {
    if (layer == "global") return "*\nglobal"
    val parent = world.project(project)?.parentName ?: ""
    return "${parent.ifEmpty { project }}\n$layer"
}

/**
 * A structured edit rewrites the layer file (comments reflow on the desktop), so stored
 * raw text goes stale: drop it and regenerate from the world on the next read.
 */
internal fun DemoServer.reflowProjectLayer(project: String) {
    world.configText.remove(configKey(project, "project"))
}

internal fun DemoServer.serviceExtras(project: String, key: String): Dict {
    world.serviceExtras["$project\n$key"]?.let { return it }
    val parent = world.project(project)?.parentName
    if (!parent.isNullOrEmpty()) return world.serviceExtras["$parent\n$key"] ?: emptyMap()
    return emptyMap()
}

internal fun DemoServer.renameServiceReferences(p: DemoWorld.Project, from: String, to: String) {
    val project = p.name
    p.services.firstOrNull { it.name == from }?.name = to
    world.serviceExtras.remove("$project\n$from")?.let { world.serviceExtras["$project\n$to"] = it }
    for (profile in p.profiles) {
        profile.services = profile.services.map { if (it == from) to else it }
    }
    rewriteDependsOn(project) { if (it == from) to else it }
}

internal fun DemoServer.rewriteDependsOn(project: String, transform: (String) -> String?) {
    for ((k, extras) in world.serviceExtras.entries.toList()) {
        if (!k.startsWith("$project\n")) continue
        val deps = extras.strings("dependsOn") ?: continue
        val mapped = deps.mapNotNull(transform)
        world.serviceExtras[k] =
            if (mapped.isEmpty()) extras - "dependsOn" else extras + ("dependsOn" to mapped)
    }
}

internal fun DemoServer.storedActionBody(project: String, key: String): Dict? {
    val actions = world.project(project)?.actions ?: return null
    val parts = key.swiftSplit(':', maxSplits = 1)
    val name = parts.firstOrNull() ?: return null
    val top = actions.firstOrNull { it.string("name") == name } ?: return null
    val body = configBody(top)
    if (parts.size == 2) return body.dict("actions")?.dict(parts[1])
    return body
}

/**
 * The action as its config file holds it: a rendered label goes back to its template,
 * a popup to what the config says, and inputs to the mapping keyed by name.
 */
private fun configBody(action: Dict): Dict {
    val body = action.toMutableMap()
    body.remove("name")
    body.remove("children")
    if (body.containsKey("configLabel")) body["label"] = body.remove("configLabel")
    if (body.containsKey("configPopup")) body["popup"] = body.remove("configPopup")
    body["inputs"].asDictList()?.let { inputs ->
        val mapping = inputsMapping(inputs)
        if (mapping == null) body.remove("inputs") else body["inputs"] = mapping
    }
    return body
}

/**
 * An `inputs` mapping as the projects list carries it: in prompt order, each input
 * with its key and every choice as a label and value.
 */
internal fun wireInputs(map: Dict): List<Dict> =
    orderedInputs(map.mapValues { it.value.asDict() ?: emptyMap() }).map { (key, body) ->
        val input = body.toMutableMap()
        input["key"] = key
        input.remove("position")
        body.list("options")?.let { options ->
            input["options"] = options.mapNotNull { option ->
                option.asString()?.let { mapOf("label" to it, "value" to it) } ?: option.asDict()
            }
        }
        input
    }

internal fun actionInfoChildren(parent: String, map: Dict): List<Dict> = map
    .mapNotNull { (childKey, value) ->
        value.asDict()?.let { it + ("name" to "$parent:$childKey") }
    }
    .sortedWith { a, b ->
        val la = a.string("label") ?: a.string("name") ?: ""
        val lb = b.string("label") ?: b.string("name") ?: ""
        localizedCaseInsensitive.compare(la, lb)
    }

// default layer content

internal fun DemoServer.defaultConfigText(p: DemoWorld.Project, layer: String): String =
    when (layer) {
        "project" -> projectYaml(p)

        "repo" -> if (p.name == "storefront") {
            "# Shared configuration checked into the repo.\n" +
                "# Everyone who clones this project gets these settings.\n"
        } else {
            ""
        }

        else ->
            "# Applies to every project on this Mac.\n" +
                "# Services and actions added here show up everywhere.\n"
    }

private fun DemoServer.projectYaml(p: DemoWorld.Project): String {
    var out = ""
    if (p.services.isNotEmpty()) {
        out += "services:\n"
        for (s in p.services) {
            val body = mutableMapOf<String, Any?>("cmd" to s.cmd)
            if (s.port > 0) body["port"] = s.port
            body.putAll(serviceExtras(p.name, s.name))
            out += "  ${s.name}:\n" + yamlLines(body, indent = 4, order = serviceKeyOrder)
        }
    }
    if (p.profiles.isNotEmpty()) {
        out += "profiles:\n"
        for (profile in p.profiles) {
            out += "  ${profile.name}: [${profile.services.joinToString(", ")}]\n"
        }
    }
    if (p.actions.isNotEmpty()) {
        out += "actions:\n"
        for (a in p.actions) {
            val name = a.string("name") ?: continue
            val body = configBody(a)
            val cmd = body.string("cmd")
            out += if (body.size == 1 && cmd != null) {
                "  $name: ${yamlScalar(cmd)}\n"
            } else {
                "  $name:\n" + yamlLines(body, indent = 4, order = actionKeyOrder)
            }
        }
    }
    if (p.zones.isNotEmpty()) {
        out += "zones:\n"
        for (zone in p.zones) {
            val name = zone.string("name") ?: continue
            out += "  $name:\n" + yamlLines(zoneBody(zone), indent = 4, order = zoneKeyOrder)
        }
    }
    return out
}

/**
 * A zone as its config file holds it: the header is the default display, and layers are
 * keyed by name.
 */
private fun zoneBody(zone: Dict): Dict {
    val body = zone.toMutableMap()
    for (key in listOf("name", "source")) body.remove(key)
    if (body.string("display") != "footer") body.remove("display")
    val layers = body.remove("layers").asDictList()
    if (!layers.isNullOrEmpty()) {
        val keyed = linkedMapOf<String, Any?>()
        for (layer in layers) {
            val name = layer.string("name") ?: continue
            keyed.putIfAbsent(name, layer - "name")
        }
        body["layers"] = keyed
    }
    return body
}

// YAML emitter

private fun yamlLines(dict: Dict, indent: Int, order: List<String>): String {
    fun rank(key: String) = order.indexOf(key).takeIf { it >= 0 } ?: order.size
    val keys = dict.keys.sortedWith { a, b ->
        if (rank(a) == rank(b)) a.compareTo(b) else rank(a).compareTo(rank(b))
    }
    return keys.joinToString("") { yamlEntry(it, dict[it], indent) }
}

private fun yamlEntry(key: String, value: Any?, indent: Int): String {
    val pad = " ".repeat(indent)
    yamlScalarString(value)?.let { return "$pad$key: $it\n" }
    value.asStringList()?.let { list ->
        return "$pad$key: [${list.joinToString(", ") { yamlScalar(it) }}]\n"
    }
    value.asDictList()?.let { rows ->
        return "$pad$key:\n" + rows.joinToString("") { yamlListItem(it, indent + 2) }
    }
    value.asList()?.let { items ->
        return "$pad$key:\n" + items.joinToString("") { item ->
            item.asDict()?.let { yamlListItem(it, indent + 2) }
                ?: "$pad  - ${yamlScalarString(item) ?: describing(item)}\n"
        }
    }
    value.asDict()?.let { map ->
        val order = if (key == "actions") actionKeyOrder else inputKeyOrder
        return "$pad$key:\n" + yamlLines(map, indent + 2, order)
    }
    return "$pad$key: ${describing(value)}\n"
}

private fun yamlListItem(row: Dict, indent: Int): String {
    val body = yamlLines(row, indent + 2, inputKeyOrder)
    val lines = body.split("\n").filter { it.isNotEmpty() }.toMutableList()
    if (lines.isEmpty()) return ""
    lines[0] = " ".repeat(indent) + "- " + lines[0].trimmingWhitespaces()
    return lines.joinToString("\n") + "\n"
}

private fun yamlScalarString(value: Any?): String? = when (value) {
    is String -> yamlScalar(value)
    is Boolean -> if (value) "true" else "false"
    is Double -> if (value == Math.rint(value)) value.toLong().toString() else value.toString()
    is Number -> value.toLong().toString()
    else -> null
}

private val yamlSpecialFirst = "#&*!|>%@`\"'{}[],-".map { it.toString() }.toSet()
private val yamlReserved = setOf("true", "false", "yes", "no", "null", "~")

private fun yamlScalar(s: String): String {
    val first = s.firstGrapheme()
    val last = s.lastGrapheme()
    val plain = first != null && last != null && "\n" !in s && ": " !in s && " #" !in s &&
        first !in yamlSpecialFirst && first != " " && last != " " && last != ":" &&
        s.lowercase() !in yamlReserved && !s.isSwiftDouble()
    if (plain) return s
    val escaped = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
    return "\"$escaped\""
}
