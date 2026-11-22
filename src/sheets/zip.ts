// Reading and writing zip files: a whole game folder as one file, and the inside of a workbook.
// Reading handles stored and deflated files (deflate undone by the platform's DecompressionStream);
// writing stores files uncompressed, which every zip reader and spreadsheet accepts.

export type ZipFiles = Record<string, Uint8Array>; // path inside the zip -> bytes

// --- Reading ------------------------------------------------------------------------------------

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

export async function readZip(bytes: Uint8Array): Promise<ZipFiles> {
  // The end-of-directory record is in the last 64 KB.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const files: ZipFiles = {};
  for (let n = 0; n < count; n++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error("the zip's directory is damaged");
    const method = u16(bytes, at + 10);
    const compressedSize = u32(bytes, at + 20);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const localOffset = u32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue; // a folder entry
    const start = localOffset + 30 + u16(bytes, localOffset + 26) + u16(bytes, localOffset + 28);
    const data = bytes.subarray(start, start + compressedSize);
    files[name] = method === 0 ? data.slice() : await inflateRaw(data);
  }
  return files;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- Writing ------------------------------------------------------------------------------------

export function writeZip(files: ZipFiles): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = header(30 + nameBytes.length, [
      [0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0x0800], [8, 2, 0], [10, 2, 0], [12, 2, 0x21],
      [14, 4, crc], [18, 4, data.length], [22, 4, data.length], [26, 2, nameBytes.length], [28, 2, 0],
    ]);
    local.set(nameBytes, 30);
    const central = header(46 + nameBytes.length, [
      [0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0x0800], [10, 2, 0], [12, 2, 0], [14, 2, 0x21],
      [16, 4, crc], [20, 4, data.length], [24, 4, data.length], [28, 2, nameBytes.length],
      [30, 2, 0], [32, 2, 0], [34, 2, 0], [36, 2, 0], [38, 4, 0], [42, 4, offset],
    ]);
    central.set(nameBytes, 46);
    parts.push(local, data);
    directory.push(central);
    offset += local.length + data.length;
  }
  const directorySize = directory.reduce((n, d) => n + d.length, 0);
  const count = Object.keys(files).length;
  const end = header(22, [[0, 4, 0x06054b50], [8, 2, count], [10, 2, count], [12, 4, directorySize], [16, 4, offset]]);
  return concat([...parts, ...directory, end]);
}

// A block of little-endian numbers: [position, width in bytes, value].
function header(size: number, fields: [number, 2 | 4, number][]): Uint8Array {
  const b = new Uint8Array(size);
  const view = new DataView(b.buffer);
  for (const [at, width, value] of fields) {
    if (width === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value >>> 0, true);
  }
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
