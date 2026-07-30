package com.supergannt.mpp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Carries the exact source .mpp bytes through an MSPDI XML round-trip so
 * open→save without schedule edits can be binary-identical.
 *
 * <p>Appended after the MSPDI document (MPXJ ignores the trailer). Stripped
 * before MSPDI parse on write.
 */
final class OriginalMppCarrier {
  static final String BEGIN = "<!--SuperGanttOriginalMpp:begin:";
  static final String END = "<!--SuperGanttOriginalMpp:end-->";
  static final String OLE_STREAM = "OriginalMpp";

  private OriginalMppCarrier() {}

  static String appendToXml(String mspdiXml, byte[] originalMpp) throws Exception {
    String sha = sha256Hex(originalMpp);
    String b64 = Base64.getEncoder().encodeToString(originalMpp);
    return mspdiXml
        + "\n"
        + BEGIN
        + "sha256="
        + sha
        + ":len="
        + originalMpp.length
        + "-->\n"
        + b64
        + "\n"
        + END
        + "\n";
  }

  static final class Split {
    final byte[] mspdiXml;
    final byte[] originalMpp; // nullable

    Split(byte[] mspdiXml, byte[] originalMpp) {
      this.mspdiXml = mspdiXml;
      this.originalMpp = originalMpp;
    }
  }

  static Split split(byte[] xmlBytes) throws Exception {
    String text = new String(xmlBytes, StandardCharsets.UTF_8);
    int begin = text.lastIndexOf(BEGIN);
    if (begin < 0) {
      return new Split(xmlBytes, null);
    }
    int headerEnd = text.indexOf("-->", begin);
    if (headerEnd < 0) {
      return new Split(xmlBytes, null);
    }
    String header = text.substring(begin + BEGIN.length(), headerEnd);
    int end = text.indexOf(END, headerEnd);
    if (end < 0) {
      throw new IllegalStateException("SuperGanttOriginalMpp trailer missing end marker");
    }
    String b64 = text.substring(headerEnd + 3, end).replaceAll("\\s+", "");
    byte[] original = Base64.getDecoder().decode(b64);
    int expectedLen = parseLen(header);
    if (expectedLen >= 0 && original.length != expectedLen) {
      throw new IllegalStateException(
          "Original MPP length mismatch: expected " + expectedLen + " got " + original.length);
    }
    String expectedSha = parseSha(header);
    if (expectedSha != null) {
      String actual = sha256Hex(original);
      if (!expectedSha.equalsIgnoreCase(actual)) {
        throw new IllegalStateException("Original MPP sha256 mismatch");
      }
    }
    byte[] xmlOnly = text.substring(0, begin).getBytes(StandardCharsets.UTF_8);
    return new Split(xmlOnly, original);
  }

  private static int parseLen(String header) {
    int i = header.indexOf("len=");
    if (i < 0) return -1;
    int start = i + 4;
    int end = start;
    while (end < header.length() && Character.isDigit(header.charAt(end))) end++;
    return Integer.parseInt(header.substring(start, end));
  }

  private static String parseSha(String header) {
    int i = header.indexOf("sha256=");
    if (i < 0) return null;
    int start = i + 7;
    int end = start;
    while (end < header.length()) {
      char c = header.charAt(end);
      if ((c >= '0' && c <= '9')
          || (c >= 'a' && c <= 'f')
          || (c >= 'A' && c <= 'F')) {
        end++;
      } else break;
    }
    return header.substring(start, end);
  }

  static String sha256Hex(byte[] data) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    return HexFormat.of().formatHex(md.digest(data));
  }
}
