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
}
