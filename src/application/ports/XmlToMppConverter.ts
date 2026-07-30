/** Converts MSPDI XML into binary Microsoft Project .mpp bytes. */
export interface XmlToMppConverter {
  convert(xml: string, fileName?: string): Promise<Uint8Array>
}
