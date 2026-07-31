import type { ProjectFileCodec } from '../../application/ports/ProjectFileCodec'
import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'
import type { XmlToMppConverter } from '../../application/ports/XmlToMppConverter'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import type { Project } from '../../domain/entities/Project'
import { MspdiCodec } from '../mspdi/MspdiCodec'
import { stripOriginalMppTrailer } from './originalMppTrailer'

/**
 * Binary Microsoft Project .mpp / .mpt:
 * - parse: MPXJ (via converter) → MSPDI → domain; keeps source bytes for identity save
 * - serialize: if !dirty and source bytes exist → exact passthrough; else OLE writer
 */
export class MppCodec implements ProjectFileCodec {
  readonly supportedExtensions = ['.mpp', '.mpt'] as const
  private readonly mspdi: MspdiCodec

  constructor(
    ids: IdGenerator,
    private readonly converter: MppToXmlConverter,
    private readonly writer?: XmlToMppConverter,
  ) {
    this.mspdi = new MspdiCodec(ids)
  }

  canHandle(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return this.supportedExtensions.some((ext) => lower.endsWith(ext))
  }

  async parse(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    // Already-XML payload saved with .mpp extension (rare) — parse directly.
    if (typeof content === 'string' && /^\s*</.test(content)) {
      const project = await this.mspdi.parse(content, fileName.replace(/\.(mpp|mpt)$/i, '.xml'))
      return project.with({ fileName })
    }

    const bytes =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : new Uint8Array(content)
    const asText = new TextDecoder().decode(bytes.slice(0, 64))
    if (/^\s*</.test(asText) || /^\s*<\?xml/i.test(asText)) {
      const xml = new TextDecoder().decode(bytes)
      const project = await this.mspdi.parse(xml, fileName.replace(/\.(mpp|mpt)$/i, '.xml'))
      return project.with({ fileName })
    }

    const xml = await this.converter.convert(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      fileName,
    )
    const project = await this.mspdi.parse(
      stripOriginalMppTrailer(xml),
      fileName.replace(/\.(mpp|mpt)$/i, '.xml'),
    )
    return project.with({
      fileName,
      dirty: false,
      sourceMppBytes: bytes.slice(),
    })
  }

  async serialize(project: Project) {
    // Binary identity: untouched plan → write the exact file we opened.
    if (!project.dirty && project.sourceMppBytes && project.sourceMppBytes.byteLength > 0) {
      return {
        content: project.sourceMppBytes.slice(),
        mimeType: 'application/vnd.ms-project',
        extension: '.mpp',
      }
    }
    if (!this.writer) {
      throw new Error(
        'MPP write requires the conversion API. Start the server / run npm run mpp:setup.',
      )
    }
    const { content: xml } = await this.mspdi.serialize(project)
    const bytes = await this.writer.convert(xml, `${project.name || 'project'}.xml`)
    return {
      content: bytes,
      mimeType: 'application/vnd.ms-project',
      extension: '.mpp',
    }
  }
}
