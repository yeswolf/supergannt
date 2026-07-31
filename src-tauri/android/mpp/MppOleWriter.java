package com.supergannt.planner.mpp;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import org.apache.poi.poifs.filesystem.DirectoryEntry;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.Entry;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.mpxj.Duration;
import org.mpxj.ProjectFile;
import org.mpxj.Relation;
import org.mpxj.RelationType;
import org.mpxj.Task;
import org.mpxj.TimeUnit;
import org.mpxj.common.MicrosoftProjectConstants;

/**
 * Writes a native OLE Compound .mpp by patching an MS Project template.
 *
 * <p>Field offsets come from the template's Props task/relation field maps
 * (MPP14), reverse-engineered against MPXJ's reader — no Aspose.
 */
public final class MppOleWriter {
  static final int MAGIC = 0xFADFADBA;
  static final int TASK_FIXED_SIZE = 202;
  static final int TASK_FIXED2_SIZE = 64;
  static final int TASK_META_SIZE = 47;
  static final int TASK_META2_SIZE = 93;
  static final int CONS_FIXED_SIZE = 20;
  static final int CONS_META_SIZE = 10;
  static final int NULL_SLOT_SIZE = 16;
  static final int NULL_SLOT_COUNT = 3;

  // Task FixedData offsets (from blank.mpp Props field map)
  static final int OFF_ID = 0;
  static final int OFF_UNIQUE_ID = 4;
  static final int OFF_WORK = 8;
  static final int OFF_CONSTRAINT_TYPE = 64;
  static final int OFF_CONSTRAINT_DATE = 66;
  static final int OFF_PRIORITY = 78;
  static final int OFF_ACTUAL_DURATION = 80;
  static final int OFF_DURATION = 84;
  static final int OFF_REMAINING_DURATION = 88;
  static final int OFF_PERCENT_COMPLETE = 92;
  static final int OFF_EARLY_START = 104;
  static final int OFF_EARLY_FINISH = 108;
  static final int OFF_ACTUAL_START = 120;
  static final int OFF_ACTUAL_FINISH = 124;
  static final int OFF_PARENT_UID = 142;
  static final int OFF_OUTLINE_LEVEL = 172;
  static final int OFF_CALENDAR_UID = 178;

  // Task Fixed2Data
  static final int OFF2_START = 50;
  static final int OFF2_FINISH = 54;

  // Var2Data type keys
  static final int VAR_NAME = 14;
  static final int VAR_WBS = 16;
  static final int VAR_DURATION_UNITS = 152;

  // Duration units: 7 = days (MPPUtility.getDurationTimeUnits)
  static final int DURATION_UNITS_DAYS = 7;

  // Embedded SuperGantt sidecar streams (same names as desktop Convert)
  static final String SGANTT_DIR = "Sgantt";
  static final String MSPDI_STREAM = "MSPDI";
  static final String MANIFEST_STREAM = "Manifest";
  static final String MANIFEST_JSON =
      "{\"format\":\"SGMPP\",\"version\":1,\"generator\":\"SuperGantt\",\"native\":true}";

  private MppOleWriter() {}

  public static void write(ProjectFile project, byte[] templateBytes, byte[] mspdiXml, OutputStream out)
      throws Exception {
    try (POIFSFileSystem fs = new POIFSFileSystem(new ByteArrayInputStream(templateBytes))) {
      DirectoryEntry root = fs.getRoot();
      DirectoryEntry dir114 = findDir(root, "114");
      if (dir114 == null) {
        throw new IllegalStateException("Template missing data directory (114)");
      }

      List<Task> tasks = collectTasks(project);
      List<Relation> relations = collectRelations(project);

      rewriteTasks(dir114, tasks, project);
      rewriteConstraints(dir114, relations);
      clearAssignments(dir114);

      if (mspdiXml != null && mspdiXml.length > 0) {
        embedSgantt(root, mspdiXml);
      }

      fs.writeFilesystem(out);
    }
  }

  private static List<Task> collectTasks(ProjectFile project) {
    List<Task> tasks = new ArrayList<>();
    for (Task t : project.getTasks()) {
      if (t == null || t.getUniqueID() == null) continue;
      tasks.add(t);
    }
    tasks.sort(
        Comparator.comparing((Task t) -> t.getID() == null ? Integer.MAX_VALUE : t.getID())
            .thenComparing(Task::getUniqueID));
    return tasks;
  }

  private static List<Relation> collectRelations(ProjectFile project) {
    List<Relation> list = new ArrayList<>();
    for (Relation r : project.getRelations()) {
      if (r == null || r.getPredecessorTask() == null || r.getSuccessorTask() == null) continue;
      list.add(r);
    }
    list.sort(Comparator.comparing(r -> r.getUniqueID() == null ? 0 : r.getUniqueID()));
    return list;
  }

  private static void rewriteTasks(DirectoryEntry dir114, List<Task> tasks, ProjectFile project)
      throws Exception {
    DirectoryEntry taskDir = (DirectoryEntry) dir114.getEntry("TBkndTask");

    int rowCount = NULL_SLOT_COUNT + tasks.size();
    ByteArrayOutputStream fixed = new ByteArrayOutputStream();
    ByteArrayOutputStream fixed2 = new ByteArrayOutputStream();
    ByteArrayOutputStream meta = new ByteArrayOutputStream();
    ByteArrayOutputStream meta2 = new ByteArrayOutputStream();
    ByteArrayOutputStream varData = new ByteArrayOutputStream();
    List<VarEntry> varEntries = new ArrayList<>();

    writeFixedMetaHeader(meta, rowCount);
    writeFixedMetaHeader(meta2, rowCount);

    // Null placeholder rows (MS Project idiom)
    for (int i = 0; i < NULL_SLOT_COUNT; i++) {
      int offset = i * NULL_SLOT_SIZE;
      byte[] slot = new byte[NULL_SLOT_SIZE];
      putInt(slot, 0, -65536 + i); // deleted markers
      fixed.write(slot);
      fixed2.write(new byte[TASK_FIXED2_SIZE]);
      writeTaskMetaItem(meta, 0x04, offset, true);
      writeTaskMeta2Item(meta2, i * TASK_FIXED2_SIZE);
    }

    int fixedOffset = NULL_SLOT_COUNT * NULL_SLOT_SIZE;
    for (int i = 0; i < tasks.size(); i++) {
      Task task = tasks.get(i);
      byte[] rec = buildTaskFixed(task, project);
      byte[] rec2 = buildTaskFixed2(task);
      fixed.write(rec);
      fixed2.write(rec2);
      writeTaskMetaItem(meta, 0x00, fixedOffset, false);
      writeTaskMeta2Item(meta2, (NULL_SLOT_COUNT + i) * TASK_FIXED2_SIZE);
      fixedOffset += TASK_FIXED_SIZE;

      Integer uid = task.getUniqueID();
      String name = task.getName() == null ? "" : task.getName();
      if (uid != null && uid == 0) {
        String projectName = project.getProjectProperties().getName();
        if ((name == null || name.isBlank()) && projectName != null && !projectName.isBlank()) {
          name = projectName;
        }
      }
      String wbs = task.getWBS() == null ? "" : task.getWBS();
      addUnicodeVar(varEntries, varData, uid, VAR_NAME, name);
      if (!wbs.isEmpty()) {
        addUnicodeVar(varEntries, varData, uid, VAR_WBS, wbs);
      }
      addShortVar(varEntries, varData, uid, VAR_DURATION_UNITS, DURATION_UNITS_DAYS);
    }

    byte[] varMeta = buildVarMeta12(varEntries, varData.size());

    replaceDocument(taskDir, "FixedMeta", meta.toByteArray());
    replaceDocument(taskDir, "FixedData", fixed.toByteArray());
    replaceDocument(taskDir, "Fixed2Meta", meta2.toByteArray());
    replaceDocument(taskDir, "Fixed2Data", fixed2.toByteArray());
    replaceDocument(taskDir, "VarMeta", varMeta);
    replaceDocument(taskDir, "Var2Data", varData.toByteArray());
  }

  private static byte[] buildTaskFixed(Task task, ProjectFile project) {
    byte[] rec = new byte[TASK_FIXED_SIZE];
    // Fill date holes with NA (0xFFFFFFFF)
    for (int o = 64; o < TASK_FIXED_SIZE - 4; o += 4) {
      putInt(rec, o, -1);
    }

    int id = task.getID() == null ? 0 : task.getID();
    int uid = task.getUniqueID() == null ? 0 : task.getUniqueID();
    putInt(rec, OFF_ID, id);
    putInt(rec, OFF_UNIQUE_ID, uid);

    Duration work = task.getWork();
    if (work != null) {
      double hours = work.convertUnits(TimeUnit.HOURS, project.getProjectProperties()).getDuration();
      putDouble(rec, OFF_WORK, hours * 60_000.0);
    } else {
      putDouble(rec, OFF_WORK, 0);
    }

    putShort(rec, OFF_CONSTRAINT_TYPE, 0); // ASAP
    putTimestamp(rec, OFF_CONSTRAINT_DATE, null);
    putShort(rec, OFF_PRIORITY, task.getPriority() == null ? 500 : task.getPriority().getValue());

    int durationRaw = encodeDurationDays(task.getDuration(), project);
    putInt(rec, OFF_DURATION, durationRaw);
    putInt(rec, OFF_REMAINING_DURATION, durationRaw);
    putInt(rec, OFF_ACTUAL_DURATION, 0);

    Number pct = task.getPercentageComplete();
    putShort(rec, OFF_PERCENT_COMPLETE, pct == null ? 0 : (int) Math.round(pct.doubleValue()));

    LocalDateTime start = task.getStart();
    LocalDateTime finish = task.getFinish();
    putTimestamp(rec, OFF_EARLY_START, start);
    putTimestamp(rec, OFF_EARLY_FINISH, finish);
    putTimestamp(rec, OFF_ACTUAL_START, null);
    putTimestamp(rec, OFF_ACTUAL_FINISH, null);

    Integer parent = task.getParentTaskUniqueID();
    putInt(rec, OFF_PARENT_UID, parent == null ? 0 : parent);

    Number outline = task.getOutlineLevel();
    putShort(rec, OFF_OUTLINE_LEVEL, outline == null ? 0 : outline.intValue());
    putInt(rec, OFF_CALENDAR_UID, -1);

    return rec;
  }

  private static byte[] buildTaskFixed2(Task task) {
    byte[] rec = new byte[TASK_FIXED2_SIZE];
    for (int i = 0; i < TASK_FIXED2_SIZE; i += 4) {
      putInt(rec, i, -1);
    }
    // Keep a few known non-date defaults from template samples
    putInt(rec, 48, 0x2c9b); // observed non-date field
    putInt(rec, 60, 7);
    putTimestamp(rec, OFF2_START, task.getStart());
    putTimestamp(rec, OFF2_FINISH, task.getFinish());
    return rec;
  }

  private static int encodeDurationDays(Duration duration, ProjectFile project) {
    if (duration == null) return 0;
    double days =
        duration.convertUnits(TimeUnit.DAYS, project.getProjectProperties()).getDuration();
    double minutesPerDay =
        project.getProjectProperties().getMinutesPerDay() == null
            ? 480.0
            : project.getProjectProperties().getMinutesPerDay().doubleValue();
    return (int) Math.round(days * minutesPerDay * 10.0);
  }

  private static void rewriteConstraints(DirectoryEntry dir114, List<Relation> relations)
      throws Exception {
    DirectoryEntry consDir = (DirectoryEntry) dir114.getEntry("TBkndCons");
    int count = relations.size();
    ByteArrayOutputStream fixed = new ByteArrayOutputStream();
    ByteArrayOutputStream meta = new ByteArrayOutputStream();
    writeFixedMetaHeader(meta, count);

    int linkId = 1;
    for (int i = 0; i < count; i++) {
      Relation rel = relations.get(i);
      byte[] rec = new byte[CONS_FIXED_SIZE];
      int uid = rel.getUniqueID() == null ? linkId : rel.getUniqueID();
      putInt(rec, 0, uid);
      putInt(rec, 4, rel.getPredecessorTask().getUniqueID());
      putInt(rec, 8, rel.getSuccessorTask().getUniqueID());
      putInt(rec, 12, encodeRelationType(rel.getType()));
      putInt(rec, 16, encodeLag(rel.getLag()));
      fixed.write(rec);

      byte[] mi = new byte[CONS_META_SIZE];
      putInt(mi, 4, i * CONS_FIXED_SIZE);
      mi[8] = (byte) 0xdd;
      meta.write(mi);
      linkId++;
    }

    // Fixed2Data/Meta: keep empty-ish valid headers matching count
    ByteArrayOutputStream meta2 = new ByteArrayOutputStream();
    ByteArrayOutputStream fixed2 = new ByteArrayOutputStream();
    writeFixedMetaHeader(meta2, count);
    for (int i = 0; i < count; i++) {
      byte[] mi = new byte[CONS_META_SIZE];
      putInt(mi, 4, i * 48);
      mi[8] = (byte) 0xdd;
      meta2.write(mi);
      fixed2.write(new byte[48]);
    }

    replaceDocument(consDir, "FixedMeta", meta.toByteArray());
    replaceDocument(consDir, "FixedData", fixed.toByteArray());
    replaceDocument(consDir, "Fixed2Meta", meta2.toByteArray());
    replaceDocument(consDir, "Fixed2Data", fixed2.toByteArray());
    // empty var streams
    replaceDocument(consDir, "VarMeta", emptyVarMeta());
  }

  private static int encodeRelationType(RelationType type) {
    if (type == null) return 1;
    return switch (type) {
      case START_START -> 2;
      case FINISH_FINISH -> 3;
      case START_FINISH -> 4;
      default -> 1; // FINISH_START
    };
  }

  private static int encodeLag(Duration lag) {
    // low 16: duration tenths-of-minutes (0 for zero lag); high 16: units days=7
    if (lag == null || Math.abs(lag.getDuration()) < 1e-9) {
      return DURATION_UNITS_DAYS << 16;
    }
    // store as days * minutesPerDay * 10 when possible
    double days = lag.getDuration();
    if (lag.getUnits() != TimeUnit.DAYS) {
      // best-effort: treat numeric value as days if unit unknown
      days = lag.getDuration();
    }
    int raw = (int) Math.round(days * 480.0 * 10.0);
    return (DURATION_UNITS_DAYS << 16) | (raw & 0xffff);
  }

  private static void clearAssignments(DirectoryEntry dir114) throws Exception {
    if (!dir114.hasEntry("TBkndAssn")) return;
    DirectoryEntry assn = (DirectoryEntry) dir114.getEntry("TBkndAssn");
    replaceDocument(assn, "FixedMeta", emptyFixedMeta());
    replaceDocument(assn, "FixedData", new byte[0]);
    replaceDocument(assn, "Fixed2Meta", emptyFixedMeta());
    replaceDocument(assn, "Fixed2Data", new byte[0]);
    replaceDocument(assn, "VarMeta", emptyVarMeta());
    replaceDocument(assn, "Var2Data", new byte[0]);
  }

  private static void embedSgantt(DirectoryEntry root, byte[] xml) throws Exception {
    DirectoryEntry sgantt;
    if (root.hasEntry(SGANTT_DIR)) {
      Entry e = root.getEntry(SGANTT_DIR);
      if (e instanceof DirectoryEntry) {
        sgantt = (DirectoryEntry) e;
        deleteChildren(sgantt);
      } else {
        e.delete();
        sgantt = root.createDirectory(SGANTT_DIR);
      }
    } else {
      sgantt = root.createDirectory(SGANTT_DIR);
    }
    sgantt.createDocument(MSPDI_STREAM, new ByteArrayInputStream(xml));
    sgantt.createDocument(
        MANIFEST_STREAM,
        new ByteArrayInputStream(MANIFEST_JSON.getBytes(StandardCharsets.UTF_8)));
  }

  private static void writeFixedMetaHeader(ByteArrayOutputStream out, int count) throws Exception {
    putInt(out, MAGIC);
    putInt(out, 0);
    putInt(out, count);
    putInt(out, 0);
  }

  private static void writeTaskMetaItem(
      ByteArrayOutputStream out, int flags, int dataOffset, boolean nullSlot) throws Exception {
    byte[] item = new byte[TASK_META_SIZE];
    if (nullSlot) {
      putInt(item, 0, flags);
      putInt(item, 4, dataOffset);
      putInt(item, 8, 8);
    } else {
      // Copied pattern from a live task FixedMeta item in blank.mpp
      putInt(item, 0, 0x00120000);
      putInt(item, 4, dataOffset);
      putInt(item, 8, 0xfefdfffe);
      putInt(item, 12, 0x0167c171);
      putInt(item, 16, 0x1fef4871);
      putInt(item, 20, 0x00001f10);
      putInt(item, 24, 0x00100000);
    }
    out.write(item);
  }

  private static void writeTaskMeta2Item(ByteArrayOutputStream out, int dataOffset)
      throws Exception {
    byte[] item = new byte[TASK_META2_SIZE];
    putInt(item, 4, dataOffset);
    putInt(item, 8, 0x0000cf7f);
    item[TASK_META2_SIZE - 1] = 0x04;
    out.write(item);
  }

  private static byte[] emptyFixedMeta() {
    ByteBuffer buf = ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN);
    buf.putInt(MAGIC);
    buf.putInt(0);
    buf.putInt(0);
    buf.putInt(0);
    return buf.array();
  }

  private static byte[] emptyVarMeta() {
    ByteBuffer buf = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN);
    buf.putInt(MAGIC);
    buf.putInt(0);
    buf.putInt(0);
    buf.putInt(0);
    buf.putInt(0);
    buf.putInt(0);
    return buf.array();
  }

  private static void addUnicodeVar(
      List<VarEntry> entries, ByteArrayOutputStream varData, Integer uid, int type, String value)
      throws Exception {
    byte[] raw = (value + "\0").getBytes(StandardCharsets.UTF_16LE);
    int offset = varData.size();
    putInt(varData, raw.length);
    varData.write(raw);
    entries.add(new VarEntry(uid, type, offset));
  }

  private static void addShortVar(
      List<VarEntry> entries, ByteArrayOutputStream varData, Integer uid, int type, int value)
      throws Exception {
    int offset = varData.size();
    putInt(varData, 2);
    putShort(varData, value);
    entries.add(new VarEntry(uid, type, offset));
  }

  private static byte[] buildVarMeta12(List<VarEntry> entries, int dataSize) {
    ByteBuffer buf =
        ByteBuffer.allocate(24 + entries.size() * 12).order(ByteOrder.LITTLE_ENDIAN);
    buf.putInt(MAGIC);
    buf.putInt(0);
    buf.putInt(entries.size());
    buf.putInt(0);
    buf.putInt(0);
    buf.putInt(dataSize);
    for (VarEntry e : entries) {
      buf.putInt(e.uid);
      buf.putInt(e.offset);
      buf.putShort((short) e.type);
      buf.putShort((short) 0);
    }
    return buf.array();
  }

  private static void replaceDocument(DirectoryEntry dir, String name, byte[] data)
      throws Exception {
    if (dir.hasEntry(name)) {
      dir.getEntry(name).delete();
    }
    dir.createDocument(name, new ByteArrayInputStream(data));
  }

  private static void deleteChildren(DirectoryEntry dir) throws Exception {
    List<String> names = new ArrayList<>();
    for (Iterator<Entry> it = dir.getEntries(); it.hasNext(); ) {
      names.add(it.next().getName());
    }
    for (String name : names) {
      dir.getEntry(name).delete();
    }
  }

  private static DirectoryEntry findDir(DirectoryEntry root, String trimmed) throws Exception {
    for (Iterator<Entry> it = root.getEntries(); it.hasNext(); ) {
      Entry e = it.next();
      if (e instanceof DirectoryEntry && e.getName().trim().equals(trimmed)) {
        return (DirectoryEntry) e;
      }
    }
    return null;
  }

  private static void putInt(byte[] data, int offset, int value) {
    ByteBuffer.wrap(data, offset, 4).order(ByteOrder.LITTLE_ENDIAN).putInt(value);
  }

  private static void putShort(byte[] data, int offset, int value) {
    ByteBuffer.wrap(data, offset, 2).order(ByteOrder.LITTLE_ENDIAN).putShort((short) value);
  }

  private static void putDouble(byte[] data, int offset, double value) {
    ByteBuffer.wrap(data, offset, 8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value);
  }

  private static void putInt(ByteArrayOutputStream out, int value) throws Exception {
    ByteBuffer buf = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN);
    buf.putInt(value);
    out.write(buf.array());
  }

  private static void putShort(ByteArrayOutputStream out, int value) throws Exception {
    ByteBuffer buf = ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN);
    buf.putShort((short) value);
    out.write(buf.array());
  }

  private static void putTimestamp(byte[] data, int offset, LocalDateTime value) {
    if (value == null) {
      putInt(data, offset, -1);
      return;
    }
    LocalDateTime epoch = MicrosoftProjectConstants.EPOCH_DATE;
    long days = ChronoUnit.DAYS.between(epoch.toLocalDate(), value.toLocalDate());
    long secondsOfDay =
        value.getHour() * 3600L + value.getMinute() * 60L + value.getSecond();
    int time = (int) (secondsOfDay / 6); // MPP stores seconds/6
    putShort(data, offset, time);
    putShort(data, offset + 2, (int) days);
  }

  private static final class VarEntry {
    final int uid;
    final int type;
    final int offset;

    VarEntry(int uid, int type, int offset) {
      this.uid = uid;
      this.type = type;
      this.offset = offset;
    }
  }
}
