package com.supergannt.planner

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.MimeTypeMap
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream

@InvokeArg
class SaveToDownloadsArgs {
  lateinit var fileName: String
  lateinit var contentsBase64: String
  var mimeType: String? = null
}

/**
 * Writes into the device public Downloads folder (internal shared storage),
 * so files show up in Files → Downloads — not under Android/data/….
 */
@TauriPlugin
class DownloadsPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun saveToDownloads(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SaveToDownloadsArgs::class.java)
      val name = File(args.fileName).name.ifBlank { "project.bin" }
      val bytes = Base64.decode(args.contentsBase64, Base64.DEFAULT)
      val mime = args.mimeType?.takeIf { it.isNotBlank() } ?: guessMime(name)
      val path = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveViaMediaStore(name, mime, bytes)
      } else {
        saveViaLegacyDownloads(name, bytes)
      }
      val res = JSObject()
      res.put("path", path)
      invoke.resolve(res)
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to save to Downloads")
    }
  }

  private fun guessMime(name: String): String {
    val ext = name.substringAfterLast('.', "").lowercase()
    return when (ext) {
      "pdf" -> "application/pdf"
      "xml", "mspdi" -> "application/xml"
      "mpp", "mpt" -> "application/vnd.ms-project"
      "mpx" -> "application/octet-stream"
      else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
        ?: "application/octet-stream"
    }
  }

  private fun uniqueDisplayName(preferred: String): String {
    val stem = preferred.substringBeforeLast('.', preferred)
    val ext = preferred.substringAfterLast('.', "")
    val hasExt = preferred.contains('.')
    var i = 0
    while (i < 10_000) {
      val candidate = when {
        i == 0 -> preferred
        hasExt -> "$stem ($i).$ext"
        else -> "$preferred ($i)"
      }
      if (!downloadExists(candidate)) return candidate
      i++
    }
    return preferred
  }

  private fun downloadExists(name: String): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val projection = arrayOf(MediaStore.MediaColumns._ID)
      val selection = "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND ${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
      val args = arrayOf(name, "${Environment.DIRECTORY_DOWNLOADS}%")
      activity.contentResolver.query(
        MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
        projection,
        selection,
        args,
        null,
      )?.use { return it.moveToFirst() }
      return false
    }
    @Suppress("DEPRECATION")
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    return File(dir, name).exists()
  }

  private fun saveViaMediaStore(preferredName: String, mime: String, bytes: ByteArray): String {
    val name = uniqueDisplayName(preferredName)
    val resolver = activity.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, mime)
      put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = resolver.insert(collection, values)
      ?: throw IllegalStateException("MediaStore insert failed for $name")
    try {
      resolver.openOutputStream(uri)?.use { out -> out.write(bytes) }
        ?: throw IllegalStateException("openOutputStream failed for $uri")
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
    } catch (e: Exception) {
      resolver.delete(uri, null, null)
      throw e
    }
    // User-facing path in Files app
    return "/storage/emulated/0/Download/$name"
  }

  @Suppress("DEPRECATION")
  private fun saveViaLegacyDownloads(preferredName: String, bytes: ByteArray): String {
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!dir.exists() && !dir.mkdirs()) {
      throw IllegalStateException("Cannot create Downloads directory")
    }
    val name = uniqueDisplayName(preferredName)
    val file = File(dir, name)
    FileOutputStream(file).use { it.write(bytes) }
    activity.sendBroadcast(
      Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)),
    )
    return file.absolutePath
  }
}
