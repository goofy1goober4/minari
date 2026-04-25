const FORBIDDEN_WORDS = [
  'therapy',
  'therapist',
  'heal',
  'cure',
  'diagnose',
  'diagnosis',
  'treatment',
  'medication',
  'recommend',
  'should',
  'must',
  'need to',
];

const FALLBACK = '...';
const DEFAULT_MAX_LEN = 60;

export function filterGuardrails(raw: string, maxLen: number = DEFAULT_MAX_LEN): string {
  let text = raw.trim();

  // Strip surrounding quotes if the model wrapped its answer.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  // Collapse newlines — keep only the first line.
  const firstLine = text.split(/\n/)[0].trim();
  if (firstLine.length > 0) text = firstLine;

  // Forbidden words → fallback (Minari went off-script).
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    if (lower.includes(word)) return FALLBACK;
  }

  // Hard length cap.
  if (text.length > maxLen) text = text.slice(0, maxLen).trimEnd() + '…';

  if (!text) return FALLBACK;
  return text;
}
