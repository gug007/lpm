plugins {
    alias(libs.plugins.lpm.android.feature)
}

dependencies {
    implementation(projects.core.ui)
    implementation(projects.core.web)

    testImplementation(projects.core.testing)
}
