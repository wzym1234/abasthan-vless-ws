#!/usr/bin/env node
// Build phase: obtain Xray-core binary. Prefer the vendored copy in the repo
// (no network needed); fall back to downloading from GitHub if absent.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const VERSION = process.env.XRAY_VERSION || 'v26.11.9';
const BASE = `https://github.com/XTLS/Xray-core/releases/download/${VERSION}`;
const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const VENDOR = path.join(ROOT, 'vendor', 'xray');
const OUT = path.join(BIN_DIR, 'xray');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node-fetch-xray' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 8) return reject(new Error('too many redirects'));
        return get(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function unzipXray(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP EOCD not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let off = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central dir');
    const method = buffer.readUInt16LE(off + 10);
    const compSize = buffer.readUInt32LE(off + 20);
    const nameLen = buffer.readUInt16LE(off + 28);
    const extraLen = buffer.readUInt16LE(off + 30);
    const commentLen = buffer.readUInt16LE(off + 32);
    const localOff = buffer.readUInt32LE(off + 42);
    const name = buffer.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === 'xray') {
      const lNameLen = buffer.readUInt16LE(localOff + 26);
      const lExtraLen = buffer.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = buffer.slice(dataStart, dataStart + compSize);
      return method === 0 ? comp : zlib.inflateRawSync(comp);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('xray entry not found');
}

(async () => {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  if (fs.existsSync(VENDOR)) {
    fs.copyFileSync(VENDOR, OUT);
    fs.chmodSync(OUT, 0o755);
    console.log(`[build] used vendored xray: ${fs.statSync(OUT).size} bytes`);
    return;
  }
  console.log(`[build] vendor missing, downloading Xray-core ${VERSION}`);
  const zip = await get(`${BASE}/Xray-linux-64.zip`);
  const xray = unzipXray(zip);
  fs.writeFileSync(OUT, xray);
  fs.chmodSync(OUT, 0o755);
  console.log(`[build] downloaded xray: ${xray.length} bytes`);
})().catch((e) => { console.error('[build] FAILED:', e && e.stack ? e.stack : e); process.exit(1); });
