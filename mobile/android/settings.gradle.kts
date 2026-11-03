pluginManagement {
    includeBuild("build-logic")
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "LpmMobile"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":app")
include(":core:data")
include(":core:demo")
include(":core:designsystem")
include(":core:model")
include(":core:navigation")
include(":core:protocol")
include(":core:push")
include(":core:tailnet")
include(":core:testing")
include(":core:ui")
include(":core:web")
include(":feature:actions")
include(":feature:claudeaccount")
include(":feature:commands")
include(":feature:connection")
include(":feature:files")
include(":feature:mac")
include(":feature:pairing")
include(":feature:projects")
include(":feature:terminal")
include(":feature:usage")
include(":feature:automations")
include(":feature:activity")
include(":feature:settings")
include(":feature:git")
include(":feature:notes")
include(":feature:memory")
include(":feature:config")
include(":feature:speech")
include(":feature:widgets")
