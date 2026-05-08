#!/usr/bin/env node
// Manual demo trigger. Hits the same /alarm endpoint that the real Claude
// Code hook (alarm-hook.js) hits — no separate code path, no hard-coding.
//
// Usage:
//   node scripts/demo-alarm.js              # random reaction
//   node scripts/demo-alarm.js loud         # force "...loud." (cookie ending)
//   node scripts/demo-alarm.js startled_jump
//   node scripts/demo-alarm.js annoyed_glare
//   node scripts/demo-alarm.js done
//
// Env (same as the hook):
//   MINARI_HOOK_PORT  — default 47823
//   MINARI_HOOK_TOKEN — required header if Minari was launched with one set

'use strict';

const http = require('node:http');

const PORT = parseInt(process.env.MINARI_HOOK_PORT || '47823', 10);
const TOKEN = process.env.MINARI_HOOK_TOKEN || '';
const force = process.argv[2] || null;
const KINDS = new Set(['startled_jump', 'annoyed_glare', 'done', 'loud']);
if (force && !KINDS.has(force)) {
  console.error('unknown reaction: ' + force);
  console.error('valid: ' + Array.from(KINDS).join(', '));
  process.exit(1);
}

const body = JSON.stringify({ event: 'demo', force });
const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;

const req = http.request(
  { hostname: '127.0.0.1', port: PORT, path: '/alarm', method: 'POST', headers },
  (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c) => (buf += c));
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(buf);
        process.exit(0);
      } else {
        console.error('alarm rejected (' + res.statusCode + '): ' + buf);
        process.exit(1);
      }
    });
  },
);
req.on('error', (err) => {
  console.error('could not reach Minari at 127.0.0.1:' + PORT + ' — is the app running?');
  console.error(err.message);
  process.exit(1);
});
req.write(body);
req.end();
