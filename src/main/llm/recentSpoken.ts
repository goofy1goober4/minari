// Pure in-memory ring of fragments Minari just said this session. Helpers
// inject "you already said: …" into the system prompt to fight E2B mode
// collapse. No DB / Electron deps so this is safe to import from test scripts.

const CAPACITY = 20;
const ring: string[] = [];

export function noteRecentSpoken(fragment: string): void {
  const trimmed = fragment.trim();
  if (!trimmed || trimmed === '...') return;
  ring.push(trimmed);
  while (ring.length > CAPACITY) ring.shift();
}

export function getRecentSpoken(n: number): string[] {
  if (n <= 0) return [];
  return ring.slice(-n);
}

export function clearRecentSpoken(): void {
  ring.length = 0;
}
