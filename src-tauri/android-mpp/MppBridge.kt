/**
 * Kotlin/MPXJ bridge skeleton for offline Android .mpp → MSPDI.
 *
 * After `npm run android:init`, copy / merge these snippets into
 * `src-tauri/gen/android` (see docs/android-offline.md):
 *
 * 1) app/build.gradle.kts dependencies:
 *      implementation("net.sf.mpxj:mpxj:13.12.0")
 *      // + AWT Color / POI stubs if MPXJ pulls desktop AWT (poi-on-android pattern)
 *
 * 2) Expose a Tauri plugin or JNI method that Rust `mpp_to_xml` calls on mobile.
 *
 * Until the bridge is linked, `mpp_to_xml` returns a clear error on Android and
 * MSPDI/MPX open+save already work fully offline in the WebView.
 */

package com.supergannt.planner.mpp

/**
 * Placeholder — replace with UniversalProjectReader + MSPDIWriter once Gradle deps land.
 *
 * Expected flow:
 *   bytes (.mpp) → temp file → UniversalProjectReader.read → MSPDIWriter.write → UTF-8 XML
 */
object MppBridge {
  fun mppToXml(mppBytes: ByteArray): String {
    throw UnsupportedOperationException(
      "Wire net.sf.mpxj after android init (see docs/android-offline.md)",
    )
  }
}
