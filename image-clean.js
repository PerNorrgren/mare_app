// ─────────────────────────────────────────────────────────────────────
// image-clean.js (Mare App 4) — removes hidden data from pictures
// children upload to the Makers' Corner, before they're stored.
//
// Phone photos (e.g. a photo of a drawing) carry EXIF data: often the
// GPS position of the house, the phone model, date and time. None of
// that should ever reach the site. For JPEG, every metadata segment
// (APP1-APP15: EXIF, XMP, ...; comments) is dropped and replaced with a
// minimal EXIF block holding only the Orientation value, so a photo
// taken sideways still shows the right way up. For PNG, text and EXIF
// chunks are dropped. Pure JavaScript, no image library needed.
// Only JPEG and PNG are accepted; anything else is refused.
// ─────────────────────────────────────────────────────────────────────

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  return null;
}

// Reads the Orientation tag (1-8) from an EXIF APP1 payload, or null.
function readOrientation(app1) {
  try {
    if (app1.toString('latin1', 0, 6) !== 'Exif\0\0') return null;
    const tiff = app1.slice(6);
    const le = tiff.toString('latin1', 0, 2) === 'II';
    const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
    const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    const ifd = u32(4);
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === 0x0112) {
        const v = u16(e + 8);
        return v >= 1 && v <= 8 ? v : null;
      }
    }
  } catch { /* malformed EXIF: treat as none */ }
  return null;
}

// A minimal EXIF APP1 segment with one tag: Orientation.
function orientationSegment(orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);        // IFD0 at offset 8
  tiff.writeUInt16LE(1, 8);        // one entry
  tiff.writeUInt16LE(0x0112, 10);  // Orientation
  tiff.writeUInt16LE(3, 12);       // SHORT
  tiff.writeUInt32LE(1, 14);       // count 1
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22);       // no next IFD
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.from([0xFF, 0xE1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function cleanJpeg(buf) {
  const out = [buf.slice(0, 2)]; // SOI
  let pos = 2;
  let orientation = null;
  let insertedOrientation = false;
  while (pos < buf.length) {
    if (buf[pos] !== 0xFF) throw new Error('Not a valid JPEG');
    let marker = buf[pos + 1];
    while (marker === 0xFF) { pos++; marker = buf[pos + 1]; } // fill bytes
    if (marker === 0xDA) { // start of scan: image data follows to the end
      if (orientation && orientation !== 1 && !insertedOrientation) out.push(orientationSegment(orientation));
      out.push(buf.slice(pos));
      break;
    }
    if (marker === 0xD9) { out.push(buf.slice(pos, pos + 2)); break; }
    if (marker >= 0xD0 && marker <= 0xD7) { out.push(buf.slice(pos, pos + 2)); pos += 2; continue; }
    const len = buf.readUInt16BE(pos + 2);
    const seg = buf.slice(pos, pos + 2 + len);
    if (marker === 0xE1) {
      const o = readOrientation(seg.slice(4));
      if (o) orientation = o;
    } else if ((marker >= 0xE2 && marker <= 0xEF) || marker === 0xFE) {
      // other application segments (XMP, maker notes...) and comments: dropped
    } else {
      // Keep APP0 (JFIF), quantisation/huffman tables, frame headers, etc.
      // The orientation block goes right after APP0 if there is one.
      out.push(seg);
      if (marker === 0xE0 && orientation && orientation !== 1 && !insertedOrientation) {
        // orientation not known yet at this point in most files; handled at SOS
      }
    }
    pos += 2 + len;
  }
  return Buffer.concat(out);
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'sPLT', 'acTL', 'fcTL', 'fdAT']);

function cleanPng(buf) {
  const out = [buf.slice(0, 8)];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > buf.length) throw new Error('Not a valid PNG');
    if (PNG_KEEP.has(type)) out.push(buf.slice(pos, end)); // tEXt, zTXt, iTXt, eXIf, tIME... dropped
    pos = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

// Returns { type, buffer } with metadata removed, or throws.
function cleanImage(buf) {
  const type = detectType(buf);
  if (type === 'image/jpeg') return { type, buffer: cleanJpeg(buf), ext: 'jpg' };
  if (type === 'image/png') return { type, buffer: cleanPng(buf), ext: 'png' };
  throw new Error('Only JPEG or PNG pictures can be uploaded.');
}

module.exports = { cleanImage, detectType, readOrientation };
