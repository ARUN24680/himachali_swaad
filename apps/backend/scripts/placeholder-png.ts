import { deflateSync } from 'node:zlib';

/**
 * Dev-only placeholder product photo (no image libraries): a warm vertical gradient with a
 * stylised jar silhouette, encoded as PNG. Used by `seed:catalog --demo --publish`.
 */
type Rgb = readonly [number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

export function placeholderJarPng(opts: { size?: number; top: Rgb; bottom: Rgb; jar: Rgb; lid: Rgb }): Buffer {
  const size = opts.size ?? 800;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    const t = y / (size - 1);
    for (let x = 0; x < size; x++) {
      let px: Rgb = [0, 1, 2].map((i) => Math.round(opts.top[i]! * (1 - t) + opts.bottom[i]! * t)) as unknown as Rgb;
      const dx = Math.abs(x - cx);
      const inLid = y > size * 0.26 && y < size * 0.34 && dx < size * 0.17;
      const inBody = y >= size * 0.34 && y < size * 0.8 && dx < size * 0.22 - Math.max(0, (y - size * 0.74) * 0.6);
      if (inLid) px = opts.lid;
      else if (inBody) px = opts.jar;
      const o = row + 1 + x * 3;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
