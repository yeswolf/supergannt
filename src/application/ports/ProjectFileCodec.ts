import type { Project } from '../../domain/entities/Project'

export interface SerializedProjectFile {
  /** Text (XML/MPX) or binary (.mpp) payload. */
  content: string | Uint8Array
  mimeType: string
  extension: string
}

export interface ProjectFileCodec {
  readonly supportedExtensions: readonly string[]
  canHandle(fileName: string): boolean
  parse(content: string | ArrayBuffer, fileName: string): Promise<Project>
  serialize(project: Project): Promise<SerializedProjectFile>
  /** Optional: returns true when this codec handles the given export format.
   *  Used to disambiguate when multiple codecs claim the same file extension
   *  (e.g. `csv-tasks` vs `csv-resources`, both .csv). */
  handlesExportFormat?(format: string): boolean
  /** Optional: content-aware import disambiguation.  When multiple codecs
   *  claim the same file extension, this method (if present) is called with
   *  the file content to decide which codec should handle the import.
   *  Used by {@link CsvCodec} to distinguish task vs resource CSVs by
   *  inspecting column headers. */
  canHandleImport?(content: string | ArrayBuffer, fileName: string): boolean
}
