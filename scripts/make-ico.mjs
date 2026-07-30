import { readFile, writeFile, copyFile } from 'node:fs/promises'

async function pngsToIco(paths) {
  const images = []
  for (const p of paths) {
    const data = await readFile(p)
    const w = data.readUInt32BE(16)
    const h = data.readUInt32BE(20)
    images.push({ w: w >= 256 ? 0 : w, h: h >= 256 ? 0 : h, data })
  }

  const headerSize = 6
  const entrySize = 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = headerSize + entrySize * images.length
  const entries = []
  for (const img of images) {
    const entry = Buffer.alloc(entrySize)
    entry.writeUInt8(img.w, 0)
    entry.writeUInt8(img.h, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(img.data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += img.data.length
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const files = [16, 24, 32, 48, 64, 128, 256].map((s) => `build/icons/icon-${s}.png`)
const ico = await pngsToIco(files)
await writeFile('build/icon.ico', ico)
await copyFile('build/icon.ico', 'electron/icon.ico')

let found = 0
for (let i = 0; i < ico.length - 4; i++) {
  if (ico[i] === 0x89 && ico[i + 1] === 0x50 && ico[i + 2] === 0x4e && ico[i + 3] === 0x47) {
    found++
  }
}
console.log('ico bytes', ico.length, 'embedded PNGs', found)
