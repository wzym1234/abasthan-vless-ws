#!/usr/bin/env node
// Build phase: download Xray-core binary and unzip it using Node's zlib only.
// No curl / unzip / tar dependency — runs on any Node 18+ buildpack image.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const VERSION = process.env.XRAY_VERSION || 'v26.11.9';
const BASE = `https://github.com/XTLS/Xray-core/releases/download/${VERSION}`;
const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const ZIP_PATH = path.join(BIN_DIR, 'xray.zip');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node-fetch-xray' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 8) return reject(new Error('too many redirects'));
        return get(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Minimal ZIP reader: locate end-of-central-directory, parse entries, inflate stored/deflated.
function unzipXray(buffer) {
  // find EOCD signature 0x06054b50 scanning backwards
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let off = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central dir header');
    const method = buffer.readUInt16LE(off + 10);
    const compSize = buffer.readUInt32LE(off + 20);
    const nameLen = buffer.readUInt16LE(off + 28);
    const extraLen = buffer.readUInt16LE(off + 30);
    const commentLen = buffer.readUInt16LE(off + 32);
    const localOff = buffer.readUInt32LE(off + 42);
    const name = buffer.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === 'xray') {
      // local header
      const lNameLen = buffer.readUInt16LE(localOff + 26);
      const lExtraLen = buffer.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const compressed = buffer.slice(dataStart, dataStart + compSize);
      const out = method === 0 ? compressed : zlib.inflateRawSync(compressed);
      return out;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('xray entry not found in zip');
}

(async () => {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log(`[build] fetching Xray-core ${VERSION} from ${BASE}`);
  const zip = await get(`${BASE}/Xray-linux-64.zip`);
  fs.writeFileSync(ZIP_PATH, zip);
  console.log(`[build] downloaded zip: ${zip.length} bytes`);
  const xray = unzipXray(zip);
  const outPath = path.join(BIN_DIR, 'xray');
  fs.writeFileSync(outPath, xray);
  fs.chmodSync(outPath, 0o755);
  console.log(`[build] wrote ${outPath}: ${xray.length} bytes, mode 755`);
})().catch((e) => {
  console.error('[build] FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
});
