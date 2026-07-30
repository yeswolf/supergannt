import type { Project } from '../../domain/entities/Project'
import type { ProjectFileCodec } from '../ports/ProjectFileCodec'
import type { ProjectRepository } from '../ports/ProjectRepository'
import { refreshProject } from '../services/ProjectRefresh'

export type ExportFormat = 'mspdi' | 'mpx' | 'mpp'

function exportFileName(project: Project, format: ExportFormat, preferred?: string): string {
  const base = (preferred ?? project.fileName ?? project.name)
    .replace(/\.(mpp|mpt|xml|mspdi|mpx)$/i, '')
    .trim() || project.name
  if (format === 'mpx') return `${base}.mpx`
  if (format === 'mpp') return `${base}.mpp`
  return `${base}.xml`
}

export class FileUseCases {
  constructor(
    private readonly codecs: readonly ProjectFileCodec[],
    private readonly repository: ProjectRepository,
  ) {}

  private codecFor(fileName: string): ProjectFileCodec {
    const codec = this.codecs.find((c) => c.canHandle(fileName))
    if (!codec) {
      throw new Error(`Unsupported file type: ${fileName}`)
    }
    return codec
  }

  async openFile(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    const codec = this.codecFor(fileName)
    const parsed = await codec.parse(content, fileName)
    const refreshed = refreshProject(parsed.with({ fileName, dirty: false }))
    await this.repository.saveDraft(refreshed)
    return refreshed
  }

  /**
   * Save formats:
   * - mspdi → .xml (MS Project / ProjectLibre interchange)
   * - mpx → .mpx
   * - mpp → binary .mpp (MS Project OLE, via template writer)
   */
  async saveFile(
    project: Project,
    preferredName?: string,
    format: ExportFormat = 'mspdi',
  ): Promise<{ project: Project; blob: Blob; fileName: string }> {
    const targetName = exportFileName(project, format, preferredName)
    const writer = this.codecFor(targetName)
    const { content, mimeType } = await writer.serialize(project)
    const saved = project.with({ fileName: targetName }).markClean()
    await this.repository.saveDraft(saved)
    const blobParts: BlobPart[] =
      typeof content === 'string' ? [content] : [content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer]
    return {
      project: saved,
      blob: new Blob(blobParts, { type: mimeType }),
      fileName: targetName,
    }
  }

  async persistDraft(project: Project): Promise<void> {
    await this.repository.saveDraft(project)
  }

  async loadDraft(): Promise<Project | null> {
    const draft = await this.repository.loadDraft()
    return draft ? refreshProject(draft) : null
  }
}
