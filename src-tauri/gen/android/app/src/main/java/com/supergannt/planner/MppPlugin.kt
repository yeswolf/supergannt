package com.supergannt.planner

import android.app.Activity
import android.util.Base64
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.supergannt.planner.mpp.MppOleWriter
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import org.mpxj.mpp.MPPReader
import org.mpxj.mspdi.MSPDIReader
import org.mpxj.mspdi.MSPDIWriter
import org.mpxj.reader.UniversalProjectReader

@InvokeArg
class MppBytesArgs {
  lateinit var contentsBase64: String
  var fileName: String? = null
}

@InvokeArg
class XmlToMppArgs {
  lateinit var xml: String
  var fileName: String? = null
}

/**
 * Offline .mpp ↔ MSPDI on Android via MPXJ (+ OLE template writer for dirty saves).
 *
 * Commands run off the UI thread — MPXJ is too heavy for the main thread (ANR).
 * Identity trailer is omitted on open: the WebView already keeps source bytes.
 */
@TauriPlugin
class MppPlugin(private val activity: Activity) : Plugin(activity) {
  private val io = Executors.newSingleThreadExecutor { r ->
    Thread(r, "supergannt-mpp").apply { isDaemon = true }
  }

  init {
    System.setProperty(
      "org.apache.poi.javax.xml.stream.XMLInputFactory",
      "com.fasterxml.aalto.stax.InputFactoryImpl",
    )
    System.setProperty(
      "org.apache.poi.javax.xml.stream.XMLOutputFactory",
      "com.fasterxml.aalto.stax.OutputFactoryImpl",
    )
    System.setProperty(
      "org.apache.poi.javax.xml.stream.EventFactory",
      "com.fasterxml.aalto.stax.EventFactoryImpl",
    )
    System.setProperty(
      "javax.xml.datatype.DatatypeFactory",
      "org.apache.xerces.jaxp.datatype.DatatypeFactoryImpl",
    )
    // Android's Harmony SAX rejects Apache features MPXJ sets (disallow-doctype-decl).
    System.setProperty(
      "javax.xml.parsers.SAXParserFactory",
      "org.apache.xerces.jaxp.SAXParserFactoryImpl",
    )
    System.setProperty(
      "javax.xml.parsers.DocumentBuilderFactory",
      "org.apache.xerces.jaxp.DocumentBuilderFactoryImpl",
    )
    // Eager smoke: surface missing AWT/JAXB classes at startup in logcat.
    io.execute {
      try {
        Class.forName("java.awt.Image")
        Class.forName("org.mpxj.mspdi.MSPDIWriter")
        MSPDIWriter() // trigger <clinit> / JAXB context
        val template = activity.assets.open("blank.mpp").use { it.readBytes() }
        val xml = convertMppToXml(template, "blank.mpp")
        val back = convertXmlToMpp(xml)
        Log.i(TAG, "smoke roundtrip OK xmlChars=${xml.length} mppBytes=${back.size}")
      } catch (t: Throwable) {
        Log.e(TAG, "smoke roundtrip FAIL", t)
      }
    }
  }

  @Command
  fun mppToXml(invoke: Invoke) {
    io.execute {
      try {
        val args = invoke.parseArgs(MppBytesArgs::class.java)
        val bytes = Base64.decode(args.contentsBase64, Base64.DEFAULT)
        val name = args.fileName ?: "project.mpp"
        Log.i(TAG, "mppToXml start name=$name bytes=${bytes.size}")
        val xml = convertMppToXml(bytes, name)
        Log.i(TAG, "mppToXml ok xmlChars=${xml.length}")
        val res = JSObject()
        res.put("xml", xml)
        invoke.resolve(res)
      } catch (t: Throwable) {
        Log.e(TAG, "mppToXml failed", t)
        invoke.reject(formatErr("mppToXml", t))
      }
    }
  }

  @Command
  fun xmlToMpp(invoke: Invoke) {
    io.execute {
      try {
        val args = invoke.parseArgs(XmlToMppArgs::class.java)
        Log.i(TAG, "xmlToMpp start xmlChars=${args.xml.length}")
        val mpp = convertXmlToMpp(args.xml)
        Log.i(TAG, "xmlToMpp ok bytes=${mpp.size}")
        val res = JSObject()
        res.put("contentsBase64", Base64.encodeToString(mpp, Base64.NO_WRAP))
        invoke.resolve(res)
      } catch (t: Throwable) {
        Log.e(TAG, "xmlToMpp failed", t)
        invoke.reject(formatErr("xmlToMpp", t))
      }
    }
  }

  private fun convertMppToXml(bytes: ByteArray, fileName: String): String {
    if (bytes.isEmpty()) {
      throw IllegalArgumentException("Empty file: $fileName")
    }
    val sniffLen = minOf(bytes.size, 64)
    val sniff = String(bytes, 0, sniffLen, StandardCharsets.UTF_8).trim()
    if (sniff.startsWith("<") || sniff.startsWith("\uFEFF<") || sniff.startsWith("<?xml")) {
      return String(bytes, StandardCharsets.UTF_8)
    }

    val input = File.createTempFile("sgantt-in-", ".mpp", activity.cacheDir)
    val output = File.createTempFile("sgantt-out-", ".xml", activity.cacheDir)
    try {
      input.writeBytes(bytes)
      val lower = fileName.lowercase()
      val project =
        if (lower.endsWith(".mpp") || lower.endsWith(".mpt") || isOle(bytes)) {
          val reader = MPPReader()
          reader.setReadPresentationData(false)
          reader.read(input)
        } else {
          UniversalProjectReader().read(input)
        } ?: throw IllegalStateException("Unsupported or unreadable project: $fileName")
      MSPDIWriter().write(project, output)
      // No OriginalMpp trailer — IPC size; JS keeps sourceMppBytes from the File.
      return output.readText(Charsets.UTF_8)
    } finally {
      input.delete()
      output.delete()
    }
  }

  private fun convertXmlToMpp(xml: String): ByteArray {
    val split = OriginalMppCarrier.split(xml.toByteArray(Charsets.UTF_8))
    if (split.originalMpp != null) {
      return split.originalMpp
    }
    val project =
      MSPDIReader().read(ByteArrayInputStream(split.mspdiXml))
        ?: throw IllegalStateException("MSPDI XML did not parse")
    val template =
      activity.assets.open("blank.mpp").use { it.readBytes() }
    val out = ByteArrayOutputStream()
    MppOleWriter.write(project, template, split.mspdiXml, out)
    return out.toByteArray()
  }

  private fun isOle(bytes: ByteArray): Boolean {
    if (bytes.size < 8) return false
    return bytes[0] == 0xd0.toByte() &&
      bytes[1] == 0xcf.toByte() &&
      bytes[2] == 0x11.toByte() &&
      bytes[3] == 0xe0.toByte()
  }

  private fun formatErr(op: String, t: Throwable): String {
    val cause = generateSequence(t) { it.cause }.last()
    val msg = cause.message?.takeIf { it.isNotBlank() } ?: cause.javaClass.simpleName
    return "$op: ${cause.javaClass.simpleName}: $msg"
  }

  companion object {
    private const val TAG = "SuperGanttMpp"
  }
}

/**
 * Same trailer format as desktop OriginalMppCarrier (used when XML already carries it).
 */
internal object OriginalMppCarrier {
  private const val BEGIN = "<!--SuperGanttOriginalMpp:begin:"
  private const val END = "<!--SuperGanttOriginalMpp:end-->"

  data class Split(val mspdiXml: ByteArray, val originalMpp: ByteArray?)

  fun split(xmlBytes: ByteArray): Split {
    val text = String(xmlBytes, Charsets.UTF_8)
    val begin = text.lastIndexOf(BEGIN)
    if (begin < 0) return Split(xmlBytes, null)
    val headerEnd = text.indexOf("-->", begin)
    if (headerEnd < 0) return Split(xmlBytes, null)
    val header = text.substring(begin + BEGIN.length, headerEnd)
    val end = text.indexOf(END, headerEnd)
    if (end < 0) throw IllegalStateException("SuperGanttOriginalMpp trailer missing end marker")
    val b64 = text.substring(headerEnd + 3, end).replace(Regex("\\s+"), "")
    val original = Base64.decode(b64, Base64.DEFAULT)
    val expectedLen = Regex("len=(\\d+)").find(header)?.groupValues?.get(1)?.toIntOrNull() ?: -1
    if (expectedLen >= 0 && original.size != expectedLen) {
      throw IllegalStateException("Original MPP length mismatch: expected $expectedLen got ${original.size}")
    }
    val expectedSha = Regex("sha256=([0-9a-fA-F]+)").find(header)?.groupValues?.get(1)
    if (expectedSha != null) {
      val actual = sha256Hex(original)
      if (!expectedSha.equals(actual, ignoreCase = true)) {
        throw IllegalStateException("Original MPP sha256 mismatch")
      }
    }
    val xmlOnly = text.substring(0, begin).toByteArray(Charsets.UTF_8)
    return Split(xmlOnly, original)
  }

  private fun sha256Hex(bytes: ByteArray): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes)
    return digest.joinToString("") { b -> "%02x".format(b) }
  }
}
