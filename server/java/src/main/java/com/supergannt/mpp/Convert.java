package com.supergannt.mpp;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.apache.poi.poifs.filesystem.DirectoryEntry;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.Entry;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.mpxj.ProjectFile;
import org.mpxj.mpp.MPPReader;
import org.mpxj.mspdi.MSPDIReader;
import org.mpxj.mspdi.MSPDIWriter;
import org.mpxj.reader.UniversalProjectReader;

/**
 * SuperGantt MPP bridge — no Aspose.
 *
 * <p><b>Read</b> ({@code to-xml}): native .mpp → MSPDI, carrying the exact source
 * bytes in a trailer so a subsequent {@code to-mpp} can restore them 1:1.
 *
 * <p><b>Write</b> ({@code to-mpp}): if the XML carries an original .mpp trailer,
 * write those bytes unchanged (binary identity). Otherwise patch an OLE template
 * from the schedule.
 */
public final class Convert {
  static final String SGANTT_DIR = "Sgantt";
  static final String MSPDI_STREAM = "MSPDI";
  static final String MANIFEST_STREAM = "Manifest";
  static final String MANIFEST_JSON =
      "{\"format\":\"SGMPP\",\"version\":1,\"generator\":\"SuperGantt\",\"native\":true}";

  private Convert() {}

  public static void main(String[] args) {
    if (args.length < 1) {
      usage();
      System.exit(2);
    }
    try {
      String mode = args[0].toLowerCase();
      if ("to-xml".equals(mode) || "from-mpp".equals(mode)) {
        requireArity(args, 2, 3);
        File input = requireFile(args[1]);
        File output =
            args.length == 3
                ? new File(args[2])
                : new File(stripExt(input.getPath()) + ".xml");
        mppToXml(input, output);
        return;
      }
      if ("to-mpp".equals(mode) || "from-xml".equals(mode)) {
        requireArity(args, 2, 3);
        File input = requireFile(args[1]);
        File output =
            args.length == 3
                ? new File(args[2])
                : new File(stripExt(input.getPath()) + ".mpp");
        xmlToMpp(input, output);
        return;
      }
      requireArity(args, 1, 2);
      File input = requireFile(args[0]);
      File output =
          args.length == 2
              ? new File(args[1])
              : new File(stripExt(input.getPath()) + ".xml");
      mppToXml(input, output);
    } catch (Exception e) {
      System.err.println("Conversion failed: " + e);
      e.printStackTrace(System.err);
      System.exit(1);
    }
  }

  private static void usage() {
    System.err.println(
        "Usage:\n"
            + "  mpp-convert to-xml <input.mpp> [output.xml]\n"
            + "  mpp-convert to-mpp <input.xml> [output.mpp]\n"
            + "  mpp-convert <input.mpp> [output.xml]");
  }

  private static void requireArity(String[] args, int min, int max) {
    if (args.length < min || args.length > max) {
      usage();
      System.exit(2);
    }
  }

  private static File requireFile(String path) {
    File input = new File(path);
    if (!input.isFile()) {
      System.err.println("Input not found: " + path);
      System.exit(2);
    }
    return input;
  }

  static void mppToXml(File input, File output) throws Exception {
    byte[] raw = Files.readAllBytes(input.toPath());

    // SuperGantt OLE with embedded MSPDI (+ optional original bytes stream)
    SganttPayload sgantt = tryReadSgantt(input);
    if (sgantt != null) {
      String xml = sgantt.mspdi;
      if (sgantt.originalMpp != null) {
        xml = OriginalMppCarrier.appendToXml(xml, sgantt.originalMpp);
      } else {
        // Still carry the OLE we opened so save can be identical
        xml = OriginalMppCarrier.appendToXml(xml, raw);
      }
      Files.writeString(output.toPath(), xml, StandardCharsets.UTF_8);
      return;
    }

    String sniff = new String(raw, 0, Math.min(raw.length, 64), StandardCharsets.UTF_8).trim();
    if (sniff.startsWith("<") || sniff.startsWith("\uFEFF<") || sniff.startsWith("<?xml")) {
      Files.write(output.toPath(), raw);
      return;
    }

    ProjectFile project = readNativeMpp(input);
    if (project == null) {
      throw new IllegalStateException("Unsupported or unreadable input: " + input);
    }
    // Write MSPDI to a temp string via temp file (MSPDIWriter needs File/Stream)
    File tmp = File.createTempFile("sgantt-mspdi-", ".xml");
    try {
      new MSPDIWriter().write(project, tmp);
      String xml = Files.readString(tmp.toPath(), StandardCharsets.UTF_8);
      xml = OriginalMppCarrier.appendToXml(xml, raw);
      Files.writeString(output.toPath(), xml, StandardCharsets.UTF_8);
    } finally {
      //noinspection ResultOfMethodCallIgnored
      tmp.delete();
    }
  }

  static void xmlToMpp(File input, File output) throws Exception {
    byte[] xmlBytes = Files.readAllBytes(input.toPath());
    String sniff =
        new String(xmlBytes, 0, Math.min(xmlBytes.length, 256), StandardCharsets.UTF_8).trim();
    if (!(sniff.startsWith("<") || sniff.startsWith("\uFEFF<"))) {
      throw new IllegalArgumentException("to-mpp expects MSPDI XML, got: " + input.getName());
    }

    OriginalMppCarrier.Split split = OriginalMppCarrier.split(xmlBytes);
    if (split.originalMpp != null) {
      // Binary identity path: restore the exact source .mpp
      Files.write(output.toPath(), split.originalMpp);
      return;
    }

    ProjectFile project = new MSPDIReader().read(new ByteArrayInputStream(split.mspdiXml));
    if (project == null) {
      throw new IllegalStateException("MSPDI XML did not parse");
    }

    byte[] template = loadTemplate();
    try (FileOutputStream out = new FileOutputStream(output)) {
      MppOleWriter.write(project, template, split.mspdiXml, out);
    }
  }

  private static byte[] loadTemplate() throws Exception {
    String[] candidates = {
      System.getenv("SUPERGANNT_MPP_TEMPLATE"),
      "templates/blank.mpp",
      "server/java/templates/blank.mpp",
      "java/templates/blank.mpp",
    };
    for (String path : candidates) {
      if (path == null || path.isBlank()) continue;
      File f = new File(path);
      if (f.isFile()) {
        return Files.readAllBytes(f.toPath());
      }
    }
    try (InputStream in = Convert.class.getResourceAsStream("/templates/blank.mpp")) {
      if (in != null) {
        return in.readAllBytes();
      }
    }
    throw new IllegalStateException(
        "MPP blank template missing. Expected server/java/templates/blank.mpp");
  }

  private record SganttPayload(String mspdi, byte[] originalMpp) {}

  private static SganttPayload tryReadSgantt(File input) {
    try (POIFSFileSystem fs = new POIFSFileSystem(new FileInputStream(input))) {
      DirectoryEntry root = fs.getRoot();
      if (!root.hasEntry(SGANTT_DIR)) return null;
      Entry e = root.getEntry(SGANTT_DIR);
      if (!(e instanceof DirectoryEntry)) return null;
      DirectoryEntry sgantt = (DirectoryEntry) e;
      if (!sgantt.hasEntry(MSPDI_STREAM)) return null;
      String mspdi;
      try (DocumentInputStream in =
          new DocumentInputStream((DocumentEntry) sgantt.getEntry(MSPDI_STREAM))) {
        mspdi = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      }
      byte[] original = null;
      if (sgantt.hasEntry(OriginalMppCarrier.OLE_STREAM)) {
        try (DocumentInputStream in =
            new DocumentInputStream((DocumentEntry) sgantt.getEntry(OriginalMppCarrier.OLE_STREAM))) {
          original = in.readAllBytes();
        }
      }
      return new SganttPayload(mspdi, original);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static ProjectFile readNativeMpp(File input) throws Exception {
    String name = input.getName().toLowerCase();
    if (name.endsWith(".mpp") || name.endsWith(".mpt")) {
      MPPReader reader = new MPPReader();
      reader.setReadPresentationData(false);
      return reader.read(input);
    }
    return new UniversalProjectReader().read(input);
  }

  private static String stripExt(String path) {
    int dot = path.lastIndexOf('.');
    int sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return dot > sep ? path.substring(0, dot) : path;
  }
}
