const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'it', 'oh', 'mm', 'hmm', 'and', 'or', 'of']);

export function extractKeywords(desc: string, max: number): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .slice(0, max)
    .join(' ');
}

const CURIOSITY_TEMPLATES: readonly string[] = [
  'that thing... {keywords}... what name?',
  'mm... {keywords}... what called?',
  '{keywords}... what?',
  'remember... {keywords}. what is?',
];

export function pickCuriosityTemplate(): string {
  return CURIOSITY_TEMPLATES[Math.floor(Math.random() * CURIOSITY_TEMPLATES.length)];
}

export function generateCuriosityQuestion(babyDescription: string): string {
  const keywords = extractKeywords(babyDescription, 3);
  const template = pickCuriosityTemplate();
  return template.replace('{keywords}', keywords || 'that...');
}
