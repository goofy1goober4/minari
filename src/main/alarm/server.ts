// Tiny localhost-only HTTP server that turns an external coding-agent hook
// (or `npm run demo:alarm`) into an in-process alarm event. Same path for
// real Claude Code hooks and the manual demo trigger — no hard-coding.
//
// Endpoint:
//   POST http://127.0.0.1:<port>/alarm
//   Body (optional JSON): { event?: string, force?: ReactionKind }
//
// Security: bound to 127.0.0.1 only. If MINARI_HOOK_TOKEN is set, the
// request must carry `Authorization: Bearer <token>`. Default for dev is
// no token (any local process can fire). Document this in the hook setup.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { WebContents } from 'electron';
import { recordMessage } from '../memory/repo';
import { noteSpoken } from '../snapshot';
import { isReactionKind, pickReaction, type ReactionKind, type AlarmReaction } from './reactions';

export const DEFAULT_PORT = 47823;

interface ServerDeps {
  port: number;
  token: string | null;
  getWebContents: () => WebContents | null;
}

let server: Server | null = null;

export function startAlarmServer(getWebContents: () => WebContents | null): void {
  const port = parsePort(process.env.MINARI_HOOK_PORT) ?? DEFAULT_PORT;
  const token = process.env.MINARI_HOOK_TOKEN || null;
  const deps: ServerDeps = { port, token, getWebContents };

  server = createServer((req, res) => handleRequest(req, res, deps));
  server.on('error', (err) => {
    console.error('[alarm-server] error:', err);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(
      '[alarm-server] listening on 127.0.0.1:' +
        port +
        (token ? ' (token required)' : ' (no token)'),
    );
  });
}

export function stopAlarmServer(): void {
  if (!server) return;
  server.close(() => console.log('[alarm-server] closed'));
  server = null;
}

function handleRequest(req: IncomingMessage, res: ServerResponse, deps: ServerDeps): void {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/alarm') {
    res.writeHead(404);
    res.end();
    return;
  }
  if (deps.token) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${deps.token}`) {
      res.writeHead(401);
      res.end('unauthorized');
      return;
    }
  }

  collectBody(req, 4096)
    .then((bodyText) => {
      let force: ReactionKind | null = null;
      let event: string | null = null;
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText) as { event?: unknown; force?: unknown };
          if (typeof parsed.event === 'string') event = parsed.event;
          if (isReactionKind(parsed.force)) force = parsed.force;
        } catch {
          // malformed body: still fire a random reaction. The hook spec says
          // to be lenient — claude-code may pass non-JSON in some setups.
        }
      }

      const reaction = pickReaction(force);
      emitAlarm(reaction, event, deps);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, kind: reaction.kind, text: reaction.text }));
    })
    .catch((err) => {
      console.error('[alarm-server] request handling failed:', err);
      res.writeHead(500);
      res.end();
    });
}

function emitAlarm(reaction: AlarmReaction, event: string | null, deps: ServerDeps): void {
  // The DB record is a real conversations row so the diary generator picks
  // alarm reactions up alongside everything else — the alarm "happened" in
  // Minari's day, not in some side log.
  recordMessage('minari', reaction.text);
  noteSpoken(reaction.text);
  console.log(
    '[alarm] ' +
      reaction.kind +
      ' → ' +
      JSON.stringify(reaction.text) +
      (event ? ' (event=' + event + ')' : ''),
  );
  const wc = deps.getWebContents();
  if (!wc || wc.isDestroyed()) {
    console.log('[alarm] no webContents → drop bubble (DB row kept)');
    return;
  }
  wc.send('minari:alarm', {
    kind: reaction.kind,
    text: reaction.text,
    mood: reaction.mood,
  });
}

function collectBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parsePort(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return null;
  return n;
}
