#!/usr/bin/env node
// Runtime: render xray config from env, then exec Xray in the foreground.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const XRAY_BIN = process.env.XRAY_BIN || path.join(ROOT, 'bin', 'xray');
const PORT = parseInt(process.env.PORT || '3000', 10);
const UUID = process.env.XRAY_UUID || 'dcf87311-146f-462c-adbe-dd6bdb0cd94b';
const WS_PATH = process.env.WS_PATH || '/dcf87311-ws';

const config = {
  log: { loglevel: 'warning' },
  inbounds: [
    {
      tag: 'vless-in',
      listen: '0.0.0.0',
      port: PORT,
      protocol: 'vless',
      settings: {
        clients: [{ id: UUID, level: 0, email: 'client@abasthan' }],
        decryption: 'none'
      },
      streamSettings: {
        network: 'ws',
        security: 'none',
        wsSettings: { path: WS_PATH }
      },
      sniffing: {
        enabled: true,
        destOverride: ['http', 'tls']
      }
    }
  ],
  outbounds: [
    { tag: 'direct', protocol: 'freedom' },
    { tag: 'block', protocol: 'blackhole', settings: { response: { type: 'http' } } }
  ]
};

const cfgPath = path.join(ROOT, 'config.runtime.json');
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
console.log(`[start] xray=${XRAY_BIN} port=${PORT} uuid=${UUID} ws=${WS_PATH}`);

if (!fs.existsSync(XRAY_BIN)) {
  console.error('[start] xray binary missing — build step did not run?');
  process.exit(1);
}

const child = spawn(XRAY_BIN, ['run', '-c', cfgPath], { stdio: 'inherit' });
child.on('exit', (code, sig) => process.exit(code == null ? 1 : code));
child.on('error', (e) => { console.error('[start] spawn error:', e); process.exit(1); });

// keep container alive / forward termination
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
