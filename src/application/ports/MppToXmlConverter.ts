/** Converts proprietary Microsoft Project binary (.mpp) into MSPDI XML. */
export interface MppToXmlConverter {
  convert(bytes: ArrayBuffer, fileName: string): Promise<string>
}
