#!/usr/bin/env node
// Real Claude Code hook entry point. Wired up by adding to ~/.claude/settings.json:
//
//   {
//     "hooks": {
//       "Notification": [
//         { "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/TO/minari/scripts/alarm-hook.js" }] }
//       ],
//       "Stop": [
//         { "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/TO/minari/scripts/alarm-hook.js" }] }
//       ]
//     }
//   }
//
// Claude Code invokes this script with hook-specific JSON on stdin. We don't
// need the payload contents — fire-and-forget is enough — but we read it so
// the parent process doesn't block on its stdout pipe.
//
// Env vars:
//   MINARI_HOOK_PORT  — port the running Minari is listening on (default 47823)
//   MINARI_HOOK_TOKEN — shared secret if Minari was launched with one set
//
// Exits 0 even on transport failure: a hook that crashes claude-code's run
// because Minari isn't running would be worse than a missed bubble.

'use strict';

const http = require('node:http');

const PORT = parseInt(process.env.MINARI_HOOK_PORT || '47823', 10);
const TOKEN = process.env.MINARI_HOOK_TOKEN || '';
const TIMEOUT_MS = 1500;

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

function pickEventName(stdinText) {
  // Best-effort: Claude Code hook payloads include hook_event_name. If we
  // can't parse, just use a generic tag — the server picks a random reaction
  // either way.
  if (!stdinText) return 'unknown';
  try {
    const obj = JSON.parse(stdinText);
    if (obj && typeof obj.hook_event_name === 'string') return obj.hook_event_name;
  } catch {
    // not JSON — that's fine
  }
  return 'unknown';
}

async function main() {
  const stdinText = await readStdin();
  const event = pickEventName(stdinText);
  const body = JSON.stringify({ event });

  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;

  const req = http.request(
    { hostname: '127.0.0.1', port: PORT, path: '/alarm', method: 'POST', headers },
    (res) => {
      res.resume();
      res.on('end', () => process.exit(0));
    },
  );
  req.setTimeout(TIMEOUT_MS, () => {
    req.destroy();
    process.exit(0);
  });
  req.on('error', () => process.exit(0));
  req.write(body);
  req.end();
}

main();
